// A race session: loads the track, runs the race through a NetClient (prediction + reconciliation) against an
// authority — the offline RaceRoom in a module Worker (main-thread fallback), or the game server over WebSocket —
// renders with interpolation and spring-smoothed corrections, and feeds the HUD/audio/VFX.
// Constructor path (RaceScreen): `new Session(three, tier, opts)`; a pending online race (raceStart) is picked up
// automatically. Explicit online entry point: `Session.online(three, tier, race)`.
import type * as THREE from 'three/webgpu';
import { loadContent, type CharacterId, type KartBodyId, type ModeId, type TrackId, type AiTier, CHARACTER_IDS, KART_BODY_IDS } from '@cr/content';
import {
  loadCtrk, toArrayBuffer, AI_TIERS, createAiDriver, makeInput, cloneWorld, copyWorld, Held,
  type RaceConfig, type SimEvent, type InputFrame, type AiDriver, type WorldState, type BakedTrack,
} from '@cr/sim';
import { NetClient, loopbackPair, type Transport, type RaceResultWire } from '@cr/net';
import type { RaceRoom, RaceResult } from '@cr/room';
import { RaceRenderer, type KartSlotVisual } from '../render/RaceRenderer.ts';
import type { QualityTier } from '../render/quality.ts';
import { sampleInput } from '../input/keyboard.ts';
import { HudPresenter } from './HudPresenter.ts';
import { raceAudioStart, raceAudioStop, raceAudioFrame, raceAudioEvent } from '../audio/race.ts';
import { save } from '../meta/save.ts';
import { t } from '../i18n/index.ts';
import { LocalAuthority } from '../net/localAuthority.ts';
import { portTransport } from '../net/transports.ts';
import { conn, registerActiveRace, takePendingRace, takeRaceChannel, latestStartTick, type OnlineRaceInfo } from '../net/online.ts';

export interface SessionOptions {
  trackId: TrackId; mode: ModeId; tier: AiTier; laps?: number; characterId: CharacterId; kartBodyId: KartBodyId; autopilot?: boolean; simRate?: number; seed?: number;
  /** Offline authority host: 'worker' (default) or 'main' (fallback; also `?authority=main`). */
  authority?: 'worker' | 'main';
  /** An online race (from raceStart); otherwise a pending one is taken from the lobby connection. */
  online?: OnlineRaceInfo;
}

const BOT_NAMES_KO = ['스파크', '토큰', '프롬프트', '컨텍스트', '벡터', '임베딩', '어텐션', '그래디언트', '로짓', '시드'];
const BOT_NAMES_EN = ['Spark', 'Token', 'Prompt', 'Context', 'Vector', 'Embed', 'Attention', 'Gradient', 'Logit', 'Seed'];

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
  slotNames: string[] = [];
  config!: RaceConfig;
  /** Where the authority runs ('worker' | 'main' | 'server'). */
  authorityKind: 'worker' | 'main' | 'server' = 'worker';

  private three: THREE.WebGPURenderer; private tier: QualityTier; private opts: SessionOptions;

  constructor(three: THREE.WebGPURenderer, tier: QualityTier, opts: SessionOptions) {
    this.three = three; this.tier = tier; this.opts = opts;
    this.onlineRace = opts.online ?? takePendingRace();
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
      this.slotNames = this.config.slots.map((s) => s.name);
      this.startTick = latestStartTick(online.raceId, online.startTick);
      if (track.hash !== this.config.trackHash) console.warn(`[net] track hash ${track.hash} ≠ server ${this.config.trackHash}`);
    } else {
      this.config = this.offlineConfig(track);
      this.simRate = Math.max(1, Math.min(16, this.opts.simRate ?? 1));
    }
    if (this.opts.autopilot) this.autopilot = createAiDriver(track, this.content, this.localSlot, AI_TIERS.pro, {}, 4242);
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
        transport, track, content: this.content, cfg: this.config, slot: this.localSlot, nowMs: () => performance.now() * this.simRate,
        mode: 'free', maxSteps: 5 * this.simRate, onLobby: (m) => this.onAuthorityMessage(m), ...(provider ? { inputProvider: provider } : {}),
      });
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
    const ko = document.documentElement.lang !== 'en';
    const names = ko ? BOT_NAMES_KO : BOT_NAMES_EN;
    // deterministic-ish variety: other characters/karts for bots
    const chars = CHARACTER_IDS.filter((c) => c !== this.opts.characterId);
    const slots = Array.from({ length: 8 }, (_, i) => {
      if (i === this.localSlot) return { kind: 'human' as const, team: 0, name: save.get().profile.name, characterId: this.opts.characterId, kartBodyId: this.opts.kartBodyId, vMul: 1 };
      const c = chars[(i * 5 + seed) % chars.length]!;
      const k = KART_BODY_IDS[(i * 3 + seed) % KART_BODY_IDS.length]!;
      return { kind: 'bot' as const, team: 0, name: `${names[(i + seed) % names.length]}-${String((seed >> (i + 2)) % 90 + 10)}`, characterId: c, kartBodyId: k, ai: this.opts.tier, vMul: AI_TIERS[this.opts.tier].vMul };
    });
    this.slotNames = slots.map((s) => s.name);
    return {
      simVersion: 1, mode: this.opts.mode, teams: 'solo', trackId: this.opts.trackId, trackHash: track.hash, laps: this.opts.laps ?? track.laps,
      slots, seed, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: true, instantBoostInItem: true },
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
      if (this.running && now - this.lastFrameAt > 50) this.simulate(now);
    }, 16);
  }

  /** Input → network → prediction; returns the sampled input (for audio). */
  private simulate(now: number): InputFrame {
    const inp = sampleInput();
    this.renderer.lookBack = (inp.held & Held.LOOK_BACK) !== 0;
    if (!this.autopilot) { this.net.submit(inp); copyInputInto(this.lastInput, inp); }
    inp.edges = 0;
    this.net.update(now * (this.isOnline ? 1 : this.simRate));
    this.net.drainEvents(this.events);
    return this.autopilot ? this.lastInput : inp;
  }

  private frame(now: number): void {
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
    this.renderer.render();
    this.hud.update(now, this.net.alpha);
    raceAudioFrame(this.net.world, this.localSlot, inp);
  }

  private finishSoon(r: RaceResultWire | RaceResult): void {
    if (this.ended) return;
    this.ended = true;
    setTimeout(() => { this.onEndCb?.(r as RaceResult); }, this.isOnline ? 2200 : 2200 / this.simRate);
  }

  world(): Readonly<WorldState> { return this.net.world; }

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

const KART_COLORS = ['#d97757', '#6a9bcc', '#788c5d', '#e8b04b', '#b57cff', '#3fb8af', '#e84a6a', '#5a6b7b'];

async function fetchBuf(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return toArrayBuffer(new Uint8Array(await r.arrayBuffer()));
}
