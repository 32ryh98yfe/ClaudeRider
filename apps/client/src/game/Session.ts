// A race session: loads the track, runs the race through a NetClient (prediction + reconciliation) against an
// authority — the offline RaceRoom in a module Worker (main-thread fallback), or the game server over WebSocket —
// renders with interpolation and spring-smoothed corrections, and feeds the HUD/audio/VFX.
// Constructor path (RaceScreen): `new Session(three, tier, opts)` for offline races (or `opts.online`).
// Online entry point: `Session.online(three, tier, race)` with the race taken from `takePendingRace()`.
import type * as THREE from 'three/webgpu';
import { loadContent, type CharacterId, type KartBodyId, type ModeId, type TrackId, type AiTier, type TeamFormat, CHARACTER_IDS, KART_BODY_IDS } from '@cr/content';
import {
  loadCtrk, toArrayBuffer, AI_TIERS, createAiDriver, fillBotSlots, localizeBotName, makeInput, cloneWorld, copyWorld, createWorld, makeContext, step, raceTicksOf, NULL_SINK, Held, Phase,
  type StepContext, type SlotConfig,
  type RaceConfig, type SimEvent, type InputFrame, type AiDriver, type WorldState, type BakedTrack,
} from '@cr/sim';
import { NetClient, loopbackPair, type Transport, type RaceResultWire } from '@cr/net';
import { raceResult, type RaceRoom, type RaceResult } from '@cr/room';
import { RaceRenderer, type KartSlotVisual } from '../render/RaceRenderer.ts';
import type { QualityTier } from '../render/quality.ts';
import { sampleInput } from '../input/keyboard.ts';
import { HudPresenter } from './HudPresenter.ts';
import { raceAudioStart, raceAudioStop, raceAudioFrame, raceAudioEvent } from '../audio/race.ts';
import { save } from '../meta/save.ts';
import { t } from '../i18n/index.ts';
import { LocalAuthority } from '../net/localAuthority.ts';
import { portTransport } from '../net/transports.ts';
import { lobby } from '../net/lobby.ts';
import { GhostRecorder, GhostPlayer, ghostConfig, type Ghost } from '@cr/sim/race/ghost.ts';
import { loadGhost, saveGhost, type GhostData } from '../meta/ghost.ts';
import { toast as uiToast } from '../ui/store/uiToast.ts';
import { conn, registerActiveRace, takeRaceChannel, latestStartTick, type OnlineRaceInfo } from '../net/online.ts';

export interface SessionOptions {
  trackId: TrackId; mode: ModeId; tier: AiTier; laps?: number; characterId: CharacterId; kartBodyId: KartBodyId; autopilot?: boolean; simRate?: number; seed?: number;
  /** Offline authority host: 'worker' (default) or 'main' (fallback; also `?authority=main`). */
  authority?: 'worker' | 'main';
  /** An online race (from raceStart); otherwise a pending one is taken from the lobby connection. */
  online?: OnlineRaceInfo;
  /** Time Attack: one kart, no bots, no rubber-band, no retire timer (13-modes-rules §4). */
  solo?: boolean;
  /** Offline team race with bots: duo = 4 teams of 2, squad = 2 teams of 4. */
  teams?: TeamFormat;
}


export class Session {
  readonly content = loadContent();
  /** The race client (prediction + reconciliation) every mode runs through. */
  net!: NetClient;
  renderer!: RaceRenderer;
  private hud!: HudPresenter;
  private last = 0;
  private lastFrameAt = 0;
  private raf = 0;
  private pump: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private events: SimEvent[] = [];
  private localSlot = 0;
  private autopilot: AiDriver | null = null;
  private onEndCb: ((r: RaceResult) => void) | null = null;
  private ended = false;
  private simRate = 1;
  private worker: Worker | null = null;
  private local: LocalAuthority | null = null;
  private onlineRace: OnlineRaceInfo | null;
  private startTick = 0;
  private viewPrev: WorldState | null = null;
  private viewCur: WorldState | null = null;
  private readonly off = { x: 0, y: 0, z: 0 };
  private lastInput: InputFrame = makeInput();
  private watchMsgs = -1;
  private watchAt = 0;
  private doneAt = 0;
  // pause (offline only): the lockstep authority waits for inputs, so stopping inputs and the clock pauses the race
  private paused = false;
  private pauseAt = 0;
  private pausedMs = 0;
  // Time Attack ghost: record own inputs; replay the stored PB in a private world rendered translucent
  private recorder: GhostRecorder | null = null;
  private ghostRun: { player: GhostPlayer; w: WorldState; prev: WorldState; ctx: StepContext; inp: InputFrame[]; raceTicks: number } | null = null;
  slotNames: string[] = [];
  config!: RaceConfig;
  /** Where the authority runs ('worker' | 'main' | 'server'). */
  authorityKind: 'worker' | 'main' | 'server' = 'worker';

  private three: THREE.WebGPURenderer; private tier: QualityTier; private opts: SessionOptions;

  constructor(three: THREE.WebGPURenderer, tier: QualityTier, opts: SessionOptions) {
    this.three = three; this.tier = tier; this.opts = opts;
    // online only when asked (opts.online / Session.online): an implicit takePendingRace() here let a stale raceStart
    // hijack a later offline race (L10 report)
    this.onlineRace = opts.online ?? null;
  }

  /** Explicit online entry point (L10's room/queue screens): a Session for a raceStart. */
  static online(three: THREE.WebGPURenderer, tier: QualityTier, race: OnlineRaceInfo, o: { autopilot?: boolean } = {}): Session {
    const p = save.get().profile;
    return new Session(three, tier, { trackId: race.config.trackId, mode: race.config.mode, tier: 'racer', characterId: p.characterId, kartBodyId: p.kartBodyId, online: race, autopilot: o.autopilot === true });
  }

  get isOnline(): boolean { return this.onlineRace !== null; }

  /** Legacy M1 accessor: an object exposing the (predicted) world, for code that expected the offline room. */
  get room(): { readonly world: Readonly<WorldState>; readonly prev: Readonly<WorldState> } { return { world: this.net.world, prev: this.net.prev }; }

  async load(progress: (p: number, label: string) => void): Promise<void> {
    const online = this.onlineRace;
    if (online) registerActiveRace({ raceId: online.raceId, setStartTick: (tk) => { this.startTick = tk; this.net?.setStartTick(tk); }, finish: (r) => this.finishSoon(r), replaceTransport: (tr) => this.net?.replaceTransport(tr) });
    const trackId = online ? online.config.trackId : this.opts.trackId;
    progress(0.05, t('common.loading'));
    const [ctrk, vis] = await Promise.all([fetchBuf(`tracks/${trackId}.ctrk`), fetchBuf(`tracks/${trackId}.vis`)]);
    progress(0.35, t(`tracks.${trackId}.name`));
    const track = loadCtrk(ctrk.slice(0));
    const q = new URLSearchParams(location.search);
    if (online) {
      this.config = online.config;
      this.localSlot = online.yourSlot;
      this.slotNames = this.config.slots.map((s) => localizeBotName(s.name, viewerLocale()));
      this.startTick = latestStartTick(online.raceId, online.startTick);
      if (track.hash !== this.config.trackHash) console.warn(`[net] track hash ${track.hash} ≠ server ${this.config.trackHash}`);
    } else {
      this.config = this.offlineConfig(track);
      this.simRate = Math.max(1, Math.min(16, this.opts.simRate ?? 1));
    }
    if (this.opts.autopilot) this.autopilot = createAiDriver(track, this.content, this.localSlot, AI_TIERS.pro, {}, 4242, this.config);
    progress(0.5, t('common.loading'));
    const lv = save.get().profile.livery;
    const visuals: KartSlotVisual[] = this.config.slots.map((s, i) => ({
      slot: i, characterId: s.characterId, kartBodyId: s.kartBodyId,
      livery: i === this.localSlot ? lv : { primary: KART_COLORS[i % KART_COLORS.length]!, secondary: '#faf9f5', pattern: i % 3, number: i + 1 },
    }));
    this.renderer = new RaceRenderer(this.three, track, vis, this.content, this.tier);
    this.renderer.localSlot = this.localSlot;
    await this.renderer.init(visuals);
    progress(0.9, t('common.loading'));
    const provider = this.autopilot ? (w: Readonly<WorldState>, out: InputFrame): void => { this.autopilot!.decide(w, out); copyInputInto(this.lastInput, out); } : undefined;
    if (online) {
      const taken = takeRaceChannel(online.raceId) ?? { channel: conn.raceChannel(), buffered: [] };
      const ch = taken.channel;
      if (!ch) throw new Error('offline');
      this.authorityKind = 'server';
      this.net = new NetClient({
        transport: ch, track, content: this.content, cfg: this.config, slot: this.localSlot, nowMs: () => performance.now(), startTick: this.startTick,
        mode: 'synced', clock: conn.clock, maxSteps: 8, ...(online.resumeToken ? { resumeToken: online.resumeToken } : {}), ...(provider ? { inputProvider: provider } : {}),
      });
      for (const b of taken.buffered) ch.onMessage?.(b); // frames that arrived while loading
      conn.send({ t: 'loaded', trackHash: track.hash });
    } else {
      const want = this.opts.authority ?? (q.get('authority') === 'main' ? 'main' : 'worker');
      const transport = (want === 'worker' ? await this.startWorker(ctrk) : null) ?? this.startMainThread(track);
      this.net = new NetClient({
        transport, track, content: this.content, cfg: this.config, slot: this.localSlot, nowMs: () => this.clock(performance.now()),
        mode: 'free', maxSteps: 5 * this.simRate, onLobby: (m) => this.onAuthorityMessage(m), ...(provider ? { inputProvider: provider } : {}),
        ...(this.opts.solo ? { onOwnInput: (_t: number, f: Readonly<InputFrame>) => this.recorder?.push(f) } : {}),
      });
    }
    if (this.opts.solo && !online) {
      this.recorder = new GhostRecorder();
      if (save.get().settings.ghost !== false) await this.loadGhostRun(track).catch((e: unknown) => console.warn('[ghost] load failed', e));
    }
    this.viewPrev = cloneWorld(this.net.world);
    this.viewCur = cloneWorld(this.net.world);
    // HudPresenter reads only `.world` of the room it was written against; hand it the predicted world
    const net = (): NetClient => this.net;
    // HudPresenter reads world + track (L10); the NetClient-backed session exposes both
    const roomLike = { get world(): Readonly<WorldState> { return net().world; }, track };
    this.hud = new HudPresenter(roomLike as unknown as RaceRoom, this.localSlot, this.slotNames, this.config, (slot, out) => this.renderer.project(slot, out));
    progress(0.95, t('common.loading'));
  }

  private offlineConfig(track: BakedTrack): RaceConfig {
    const seed = this.opts.seed ?? ((Date.now() & 0x7fffffff) ^ 0x5bd1e995);
    // deterministic-ish variety: other characters/karts for bots
    const chars = CHARACTER_IDS.filter((c) => c !== this.opts.characterId);
    const teams: TeamFormat = this.opts.solo ? 'solo' : (this.opts.teams ?? 'solo');
    // duo: 4 teams of 2 (slots 0-1, 2-3, …); squad: 2 teams of 4 (alternating, so the grid mixes colours)
    const teamOf = (i: number): number => (teams === 'duo' ? i >> 1 : teams === 'squad' ? i & 1 : 0);
    const slots = Array.from({ length: 8 }, (_, i): SlotConfig => {
      if (i === this.localSlot) return { kind: 'human' as const, team: teamOf(i), name: save.get().profile.name, characterId: this.opts.characterId, kartBodyId: this.opts.kartBodyId, vMul: 1 };
      if (this.opts.solo) return { kind: 'empty' as const, team: 0, name: '', characterId: 'clay', kartBodyId: 'pebble', vMul: 1 };
      const c = chars[(i * 5 + seed) % chars.length]!;
      const k = KART_BODY_IDS[(i * 3 + seed) % KART_BODY_IDS.length]!;
      return { kind: 'bot' as const, team: teamOf(i), name: '', characterId: c, kartBodyId: k, ai: this.opts.tier, vMul: AI_TIERS[this.opts.tier].vMul };
    });
    // one bot identity scheme with the server (14-ai §9): English on the wire, localized for display
    const filled = fillBotSlots(this.content, slots, { roomSeed: seed, tier: this.opts.tier });
    this.slotNames = filled.map((s) => localizeBotName(s.name, viewerLocale()));
    return {
      simVersion: 1, mode: this.opts.mode, teams, trackId: this.opts.trackId, trackHash: track.hash, laps: this.opts.laps ?? track.laps,
      slots: filled, seed: this.opts.solo ? 0 : seed,
      rules: { retireTicks: this.opts.solo ? 60 * 60 * 60 : 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: !this.opts.solo, instantBoostInItem: true },
      introTicks: 150, countdownTicks: 180,
    };
  }

  /** The offline authority in a module Worker; null (→ main-thread fallback) if Workers are unavailable or fail. */
  private async startWorker(ctrk: ArrayBuffer): Promise<Transport | null> {
    if (typeof Worker === 'undefined' || typeof MessageChannel === 'undefined') return null;
    try {
      const w = new Worker(new URL('../workers/authority.worker.ts', import.meta.url), { type: 'module', name: 'authority' });
      const ch = new MessageChannel();
      const ok = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 8000);
        w.onmessage = (e: MessageEvent) => {
          const m = e.data as { t: string; message?: string };
          if (m.t === 'ready') { clearTimeout(timer); resolve(true); }
          else if (m.t === 'error') { console.warn('[authority worker]', m.message); clearTimeout(timer); resolve(false); }
        };
        w.onerror = (e) => { console.warn('[authority worker]', e.message); clearTimeout(timer); resolve(false); };
        const copy = ctrk.slice(0);
        w.postMessage({ t: 'init', config: this.config, ctrk: copy, slot: this.localSlot, port: ch.port2 }, [copy, ch.port2]);
      });
      if (!ok) { w.terminate(); return null; }
      this.worker = w;
      this.authorityKind = 'worker';
      return portTransport(ch.port1);
    } catch (e) {
      console.warn('[authority worker] unavailable, using the main thread', e);
      return null;
    }
  }

  private startMainThread(track: BakedTrack): Transport {
    const [client, authority] = loopbackPair(0);
    this.local = new LocalAuthority({ config: this.config, track, content: this.content, slot: this.localSlot, transport: authority });
    this.authorityKind = 'main';
    return client;
  }

  private onAuthorityMessage(m: unknown): void {
    const msg = m as { t?: string; result?: RaceResultWire };
    if (msg.t === 'raceEnd' && msg.result) this.finishSoon(msg.result);
  }

  onEnd(cb: (r: RaceResult) => void): void { this.onEndCb = cb; }

  start(): void {
    this.running = true;
    this.last = performance.now();
    raceAudioStart(this.config.mode);
    const frame = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(frame);
    // When rendering stalls (background tab, a slow software rasterizer) the race must keep sending inputs and
    // reconciling, so a timer steps the simulation whenever no frame has run for 50 ms.
    this.pump = setInterval(() => {
      const now = performance.now();
      if (this.running && !this.paused && now - this.lastFrameAt > 50) this.simulate(now);
    }, 16);
  }

  /** Input → network → prediction; returns the sampled input (for audio). */
  private simulate(now: number): InputFrame {
    const inp = sampleInput();
    this.renderer.lookBack = (inp.held & Held.LOOK_BACK) !== 0;
    if (!this.autopilot) { this.net.submit(inp); copyInputInto(this.lastInput, inp); }
    inp.edges = 0;
    this.net.update(this.isOnline ? now : this.clock(now));
    this.net.drainEvents(this.events);
    if (this.isOnline) this.watchOnline(now);
    return this.autopilot ? this.lastInput : inp;
  }

  private frame(now: number): void {
    if (this.paused) { this.last = now; this.lastFrameAt = now; this.renderer.render(); return; }
    let dt = (now - this.last) / 1000;
    this.last = now;
    this.lastFrameAt = now;
    if (dt > 0.25) dt = 0.25;
    const inp = this.simulate(now);
    for (const e of this.events) { this.renderer.onEvent(e); this.hud.onEvent(e); raceAudioEvent(e, this.localSlot); }
    this.events.length = 0;
    // draw every kart at its predicted pose plus the spring-smoothed correction offset (ADR-007 visualOffset)
    const vp = this.viewPrev!, vc = this.viewCur!;
    copyWorld(vp, this.net.prev);
    copyWorld(vc, this.net.world);
    for (let s = 0; s < vc.karts.length; s++) {
      this.net.visualOffset(s, this.off);
      const yaw = this.net.visualYaw(s);
      if (this.off.x === 0 && this.off.y === 0 && this.off.z === 0 && yaw === 0) continue;
      for (const w of [vp, vc]) {
        const b = w.karts[s]!.body;
        b.px += this.off.x; b.py += this.off.y; b.pz += this.off.z;
        if (yaw !== 0) { const c = Math.cos(yaw), sn = Math.sin(yaw), fx = b.fx, fz = b.fz; b.fx = fx * c + fz * sn; b.fz = -fx * sn + fz * c; }
      }
    }
    this.renderer.update(vp, vc, this.net.alpha, dt);
    if (this.ghostRun) this.stepGhost(dt);
    this.renderer.render();
    this.hud.update(now, this.net.alpha);
    raceAudioFrame(this.net.world, this.localSlot, inp);
  }

  /**
   * Online self-healing: if race frames stop while the socket looks alive (a peer the server dropped, a stalled
   * stream) reconnect, which re-attaches and resumes the race; and if the authoritative world shows the race
   * finished but no raceEnd arrived, take the result from that world (the same pure function the server uses).
   */
  private watchOnline(now: number): void {
    if (this.ended) return;
    const s = this.net.stats;
    if (s.msgsIn !== this.watchMsgs) { this.watchMsgs = s.msgsIn; this.watchAt = now; }
    else if (s.serverTickEst > 60 && conn.connected && now - this.watchAt > 4000) {
      console.warn('[net] race stream stalled; reconnecting');
      this.watchAt = now;
      conn.forceReconnect();
    }
    if (this.net.auth.phase === Phase.DONE) {
      if (!this.doneAt) this.doneAt = now;
      else if (now - this.doneAt > 3000) {
        const r = raceResult(this.net.auth, this.config);
        if (!lobby.lastResult.value) lobby.lastResult.value = r;
        this.finishSoon(r);
      }
    }
  }

  private finishSoon(r: RaceResultWire | RaceResult): void {
    if (this.ended) return;
    this.ended = true;
    if (this.recorder) void this.saveGhostIfBest().catch((e: unknown) => console.warn('[ghost] save failed', e));
    setTimeout(() => { this.onEndCb?.(r as RaceResult); }, this.isOnline ? 2200 : 2200 / this.simRate);
  }

  world(): Readonly<WorldState> { return this.net.world; }

  /** Offline races pause (L10-session-hooks §1). Online races never pause. */
  setPaused(p: boolean): void {
    if (this.isOnline || p === this.paused) return;
    const now = performance.now();
    if (p) this.pauseAt = now;
    else this.pausedMs += now - this.pauseAt;
    this.paused = p;
    this.last = now;
  }

  get isPaused(): boolean { return this.paused; }

  /** The offline race clock: wall time minus paused time, scaled by ?simRate. */
  private clock(now: number): number { return (now - this.pausedMs) * this.simRate; }

  /** Time Attack: the PB ghost replays in its own world, one tick per race tick (L1 race/ghost.ts). */
  private async loadGhostRun(track: BakedTrack): Promise<void> {
    const d = await loadGhost(this.config.trackId, this.config.simVersion, track.hash);
    if (d === 'outdated') { uiToast(t('errors.ghost_outdated'), 'info'); return; }
    if (!d) return;
    const g = fromGhostData(d);
    const cfg = ghostConfig(g);
    const w = createWorld(cfg, track, this.content);
    this.ghostRun = { player: new GhostPlayer(g), w, prev: cloneWorld(w), ctx: makeContext({ track, cfg, content: this.content, role: 'authority', events: NULL_SINK }), inp: [makeInput()], raceTicks: d.raceTicks };
    this.renderer.setGhost({ characterId: g.characterId, kartBodyId: g.kartBodyId });
  }

  private stepGhost(dt: number): void {
    const gr = this.ghostRun!;
    let n = 0;
    while (gr.w.tick < this.net.world.tick && n < 32) {
      copyWorld(gr.prev, gr.w);
      if (!gr.player.next(gr.inp[0]!)) break;
      step(gr.w, gr.inp, gr.ctx);
      n++;
    }
    this.renderer.updateGhost(gr.prev, gr.w, this.net.alpha, dt);
  }

  /** Saves this run as the track's ghost when it finished and beat the stored one. */
  private async saveGhostIfBest(): Promise<void> {
    const w = this.net.world, k = w.karts[this.localSlot];
    if (!this.recorder || !k || k.race.finishTick < 0) return;
    const raceTicks = raceTicksOf(w, k);
    if (this.ghostRun && this.ghostRun.raceTicks <= raceTicks) return;
    const g = this.recorder.finish(this.config, { raceTicks, bestLapTicks: k.race.bestLapTicks, lapTicks: [], finalHash: 0 }, this.localSlot);
    await saveGhost(toGhostData(g));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.pump) clearInterval(this.pump);
    this.pump = null;
    raceAudioStop();
    this.hud?.hide();
    this.renderer?.dispose();
    this.net?.close();
    this.worker?.terminate();
    this.worker = null;
    this.local = null;
    if (this.onlineRace) registerActiveRace(null);
  }
}

function copyInputInto(d: InputFrame, s: Readonly<InputFrame>): void {
  d.steer = s.steer; d.throttle = s.throttle; d.brake = s.brake; d.held = s.held; d.edges = s.edges; d.aim = s.aim; d.emote = s.emote;
}

function toGhostData(g: Ghost): GhostData {
  return { v: 1, trackId: g.trackId, simVersion: g.simVersion, trackHash: g.trackHash, config: ghostConfig(g), inputs: g.runs, raceTicks: g.raceTicks, savedAt: Date.now() };
}

function fromGhostData(d: GhostData): Ghost {
  const c = d.config, s = c.slots[0]!;
  let ticks = 0;
  for (let i = 1; i < d.inputs.length; i += 2) ticks += d.inputs[i]!;
  return {
    simVersion: d.simVersion, seed: c.seed, mode: c.mode, laps: c.laps, introTicks: c.introTicks, countdownTicks: c.countdownTicks, rules: { ...c.rules },
    trackId: d.trackId, trackHash: d.trackHash, characterId: s.characterId, kartBodyId: s.kartBodyId, name: s.name,
    ticks, raceTicks: d.raceTicks, bestLapTicks: 0, lapTicks: [], finalHash: 0, runs: d.inputs,
  };
}

const KART_COLORS = ['#d97757', '#6a9bcc', '#788c5d', '#e8b04b', '#b57cff', '#3fb8af', '#e84a6a', '#5a6b7b'];

async function fetchBuf(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return toArrayBuffer(new Uint8Array(await r.arrayBuffer()));
}

function viewerLocale(): 'ko' | 'en' { return document.documentElement.lang === 'en' ? 'en' : 'ko'; }
