// A race session: loads the track, runs the (offline) authority at a fixed 60 Hz, renders with interpolation,
// feeds the HUD/audio/VFX. Online sessions (lane L9) implement the same surface with NetClient.
import type * as THREE from 'three/webgpu';
import { loadContent, type CharacterId, type KartBodyId, type ModeId, type TrackId, type AiTier, CHARACTER_IDS, KART_BODY_IDS } from '@cr/content';
import { loadCtrk, toArrayBuffer, DT, AI_TIERS, createAiDriver, makeInput, Held, type RaceConfig, type SimEvent, type InputFrame, type AiDriver, type WorldState } from '@cr/sim';
import { RaceRoom, type RaceResult } from '@cr/room';
import { RaceRenderer, type KartSlotVisual } from '../render/RaceRenderer.ts';
import type { QualityTier } from '../render/quality.ts';
import { sampleInput } from '../input/keyboard.ts';
import { HudPresenter } from './HudPresenter.ts';
import { raceAudioStart, raceAudioStop, raceAudioFrame, raceAudioEvent } from '../audio/race.ts';
import { save } from '../meta/save.ts';
import { t } from '../i18n/index.ts';

export interface SessionOptions { trackId: TrackId; mode: ModeId; tier: AiTier; laps?: number; characterId: CharacterId; kartBodyId: KartBodyId; autopilot?: boolean; simRate?: number; seed?: number }

const BOT_NAMES_KO = ['스파크', '토큰', '프롬프트', '컨텍스트', '벡터', '임베딩', '어텐션', '그래디언트', '로짓', '시드'];
const BOT_NAMES_EN = ['Spark', 'Token', 'Prompt', 'Context', 'Vector', 'Embed', 'Attention', 'Gradient', 'Logit', 'Seed'];

export class Session {
  readonly content = loadContent();
  room!: RaceRoom;
  renderer!: RaceRenderer;
  private hud!: HudPresenter;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private events: SimEvent[] = [];
  private localSlot = 0;
  private autopilot: AiDriver | null = null;
  private autoInput: InputFrame = makeInput();
  private onEndCb: ((r: RaceResult) => void) | null = null;
  private ended = false;
  private simRate = 1;
  slotNames: string[] = [];
  config!: RaceConfig;

  private three: THREE.WebGPURenderer; private tier: QualityTier; private opts: SessionOptions;

  constructor(three: THREE.WebGPURenderer, tier: QualityTier, opts: SessionOptions) { this.three = three; this.tier = tier; this.opts = opts; }

  async load(progress: (p: number, label: string) => void): Promise<void> {
    progress(0.05, t('common.loading'));
    const [ctrk, vis] = await Promise.all([fetchBuf(`tracks/${this.opts.trackId}.ctrk`), fetchBuf(`tracks/${this.opts.trackId}.vis`)]);
    progress(0.35, t(`tracks.${this.opts.trackId}.name`));
    const track = loadCtrk(ctrk);
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
    this.config = {
      simVersion: 1, mode: this.opts.mode, teams: 'solo', trackId: this.opts.trackId, trackHash: track.hash, laps: this.opts.laps ?? track.laps,
      slots, seed, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: true, instantBoostInItem: true },
      introTicks: 150, countdownTicks: 180,
    };
    this.slotNames = slots.map((s) => s.name);
    this.room = new RaceRoom({ config: this.config, track, content: this.content });
    this.room.onEnd((r) => this.finishSoon(r));
    if (this.opts.autopilot) this.autopilot = createAiDriver(track, this.content, this.localSlot, AI_TIERS.pro, {}, 4242);
    this.simRate = Math.max(1, Math.min(16, this.opts.simRate ?? 1));
    progress(0.5, t('common.loading'));
    const lv = save.get().profile.livery;
    const visuals: KartSlotVisual[] = slots.map((s, i) => ({
      slot: i, characterId: s.characterId, kartBodyId: s.kartBodyId,
      livery: i === this.localSlot ? lv : { primary: KART_COLORS[i % KART_COLORS.length]!, secondary: '#faf9f5', pattern: i % 3, number: i + 1 },
    }));
    this.renderer = new RaceRenderer(this.three, track, vis, this.content, this.tier);
    this.renderer.localSlot = this.localSlot;
    await this.renderer.init(visuals);
    progress(0.95, t('common.loading'));
    this.hud = new HudPresenter(this.room, this.localSlot, this.slotNames, this.config, (slot, out) => this.renderer.project(slot, out));
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
  }

  private frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.acc += dt * this.simRate;
    const inp = sampleInput();
    this.renderer.lookBack = (inp.held & Held.LOOK_BACK) !== 0;
    let n = 0;
    const maxSteps = 5 * this.simRate;
    while (this.acc >= DT && n < maxSteps) {
      if (this.autopilot) { this.autopilot.decide(this.room.world, this.autoInput); this.room.setInput(this.localSlot, this.autoInput); }
      else this.room.setInput(this.localSlot, inp);
      inp.edges = 0;
      this.room.tick();
      this.room.drainEvents(this.events);
      this.acc -= DT;
      n++;
    }
    if (n === maxSteps) this.acc = 0;
    for (const e of this.events) { this.renderer.onEvent(e); this.hud.onEvent(e); raceAudioEvent(e, this.localSlot); }
    this.events.length = 0;
    const alpha = this.acc / DT;
    this.renderer.update(this.room.prev, this.room.world, alpha, dt);
    this.renderer.render();
    this.hud.update(now, alpha);
    raceAudioFrame(this.room.world, this.localSlot, this.autopilot ? this.autoInput : inp);
  }

  private finishSoon(r: RaceResult): void {
    if (this.ended) return;
    this.ended = true;
    setTimeout(() => { this.onEndCb?.(r); }, 2200 / this.simRate);
  }

  world(): Readonly<WorldState> { return this.room.world; }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    raceAudioStop();
    this.hud?.hide();
    this.renderer?.dispose();
  }
}

const KART_COLORS = ['#d97757', '#6a9bcc', '#788c5d', '#e8b04b', '#b57cff', '#3fb8af', '#e84a6a', '#5a6b7b'];

async function fetchBuf(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return toArrayBuffer(new Uint8Array(await r.arrayBuffer()));
}
