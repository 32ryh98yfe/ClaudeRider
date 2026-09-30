// Test rig: bake a .ctd in memory, load it through the binary .ctrk path, and drive karts tick by tick.
import { readFileSync } from 'node:fs';
import { loadContent, type ContentTables } from '@cr/content';
import { buildTrack } from '@cr/trackc/build.ts';
import {
  createWorld, loadCtrk, toArrayBuffer, makeContext, step, makeInput, ArraySink, AI_TIERS, createAiDriver,
  type BakedTrack, type RaceConfig, type InputFrame, type WorldState, type StepContext, type SimEvent, type SlotConfig, type AiDriver,
} from '@cr/sim';

const ROOT = new URL('../../../', import.meta.url);
const trackCache = new Map<string, BakedTrack>();
let content: ContentTables | null = null;

export function getContent(): ContentTables { return (content ??= loadContent()); }

/** Bakes tracks/<rel>.ctd once per test file and loads it from the serialized bytes. */
export function bakedTrack(rel: string): BakedTrack {
  let t = trackCache.get(rel);
  if (!t) {
    const file = new URL(`tracks/${rel}.ctd`, ROOT);
    const r = buildTrack(readFileSync(file, 'utf8'), file.pathname);
    t = loadCtrk(toArrayBuffer(r.ctrk));
    trackCache.set(rel, t);
  }
  return t;
}

export interface RigOptions { mode?: 'speed' | 'item'; laps?: number; slots?: Partial<SlotConfig>[]; seed?: number; introTicks?: number; countdownTicks?: number }

export interface Rig {
  w: WorldState; ctx: StepContext; cfg: RaceConfig; track: BakedTrack; inputs: InputFrame[]; events: SimEvent[];
  bots: (AiDriver | null)[];
  /** Advances one tick; `drive` fills the inputs of non-bot slots first. */
  tick(drive?: (w: WorldState, inputs: InputFrame[]) => void): void;
  run(n: number, drive?: (w: WorldState, inputs: InputFrame[]) => void): void;
}

export function makeRig(track: BakedTrack, o: RigOptions = {}): Rig {
  const c = getContent();
  const slots: SlotConfig[] = (o.slots ?? [{}]).map((s, i) => ({
    kind: 'human', team: 0, name: `k${i}`, characterId: 'clay', kartBodyId: 'pebble', vMul: 1, ...s,
  } as SlotConfig));
  const cfg: RaceConfig = {
    simVersion: 1, mode: o.mode ?? 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: o.laps ?? track.laps,
    slots, seed: o.seed ?? 1234,
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true },
    introTicks: o.introTicks ?? 0, countdownTicks: o.countdownTicks ?? 180,
  };
  const w = createWorld(cfg, track, c);
  const sink = new ArraySink();
  const ctx = makeContext({ track, cfg, content: c, role: 'authority', events: sink });
  const inputs = slots.map(() => makeInput());
  const bots = slots.map((s, i) => (s.kind === 'bot' ? createAiDriver(track, c, i, AI_TIERS[s.ai ?? 'pro'], {}, 99 + i) : null));
  const events: SimEvent[] = [];
  const rig: Rig = {
    w, ctx, cfg, track, inputs, events, bots,
    tick(drive) {
      drive?.(w, inputs);
      for (let i = 0; i < bots.length; i++) bots[i]?.decide(w, inputs[i]!);
      step(w, inputs, ctx);
      sink.drain(events);
      for (const inp of inputs) inp.edges = 0;
    },
    run(n, drive) { for (let i = 0; i < n; i++) rig.tick(drive); },
  };
  return rig;
}

/** Forward speed of kart `slot` in display km/h. */
export function kmh(w: WorldState, slot = 0): number {
  const b = w.karts[slot]!.body;
  return (b.vx * b.fx + b.vy * b.fy + b.vz * b.fz) * 5.4;
}
