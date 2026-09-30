// step() micro-benchmark (40-perf-budgets §3.2: ≤ 6 µs per kart-tick, AI excluded).
// Records the 8 bots' inputs of a full race once, then replays them through fresh worlds and times step() alone.
// Usage: node tools/bench/step.ts [trackId=meadow_loop] [mode=speed] [reps=3]
import { readFileSync, existsSync } from 'node:fs';
import { loadContent } from '@cr/content';
import { buildTrack } from '@cr/trackc/build.ts';
import {
  AI_TIERS, ArraySink, NULL_SINK, Phase, createAiDriver, createWorld, hashWorld, loadCtrk, makeContext, makeInput, packInput, step,
  toArrayBuffer, unpackInput, type BakedTrack, type InputFrame, type RaceConfig,
} from '@cr/sim';

const [id = 'meadow_loop', mode = 'speed', repsArg = '3'] = process.argv.slice(2);
const root = new URL('../../', import.meta.url);
function track(): BakedTrack {
  const baked = new URL(`apps/client/public/tracks/${id}.ctrk`, root);
  if (existsSync(baked)) return loadCtrk(toArrayBuffer(readFileSync(baked)));
  const theme = id === 'proving_ring' ? 'spark_circuit' : 'clayhill_village';
  const src = new URL(`tracks/${theme}/${id}.ctd`, root);
  return buildTrack(readFileSync(src, 'utf8'), src.pathname).track;
}
const T = track();
const content = loadContent();
const chars = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const karts = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
const cfg: RaceConfig = {
  simVersion: 1, mode: mode as 'speed', teams: 'solo', trackId: T.id, trackHash: T.hash, laps: T.laps,
  slots: chars.map((c, i) => ({ kind: 'bot' as const, team: 0, name: c, characterId: c, kartBodyId: karts[i]!, ai: 'pro' as const, vMul: 1 })),
  seed: 1234, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180,
};

// 1. record
const w0 = createWorld(cfg, T, content);
const ctx0 = makeContext({ track: T, cfg, content, role: 'authority', events: new ArraySink() });
const drivers = cfg.slots.map((_, i) => createAiDriver(T, content, i, AI_TIERS.pro, {}, 99 + i));
const inputs: InputFrame[] = cfg.slots.map(() => makeInput());
const log: number[] = [];
let tAi = 0;
const tr0 = performance.now();
while (w0.phase !== Phase.DONE && w0.tick < 60 * 60 * 6) {
  const a = performance.now();
  for (let i = 0; i < 8; i++) drivers[i]!.decide(w0, inputs[i]!);
  tAi += performance.now() - a;
  for (let i = 0; i < 8; i++) log.push(packInput(inputs[i]!));
  step(w0, inputs, ctx0);
}
const recMs = performance.now() - tr0, ticks = log.length / 8, ref = hashWorld(w0);

// 2. replay step() only
const reps = Number(repsArg);
const frames: InputFrame[] = cfg.slots.map(() => makeInput());
let best = Infinity, bestCpu = Infinity;
for (let r = 0; r < reps; r++) {
  const w = createWorld(cfg, T, content);
  const ctx = makeContext({ track: T, cfg, content, role: 'authority', events: NULL_SINK });
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < 8; i++) unpackInput(log[t * 8 + i]!, frames[i]!);
    step(w, frames, ctx);
  }
  const ms = performance.now() - t0;
  const cu = process.cpuUsage(c0);
  best = Math.min(best, ms);
  // CPU time of this process: less sensitive than wall time when other jobs share the cores
  bestCpu = Math.min(bestCpu, (cu.user + cu.system) / 1000);
  if (hashWorld(w) !== ref) throw new Error('replay diverged from the recorded race');
}
const perKartTick = (best * 1000) / (ticks * 8);
console.log(`${id} ${mode}: ${ticks} ticks, 8 karts`);
console.log(`  step():      ${perKartTick.toFixed(2)} µs per kart-tick (best of ${reps}; budget 6.00); CPU time ${((bestCpu * 1000) / (ticks * 8)).toFixed(2)} µs`);
console.log(`  AI decide(): ${((tAi * 1000) / (ticks * 8)).toFixed(2)} µs per kart-tick (budget 5.00)`);
console.log(`  record run:  ${recMs.toFixed(0)} ms incl. AI; replay hash ${ref.toString(16)} ✓`);
if (process.env.BENCH_ASSERT && perKartTick > 6) { console.error('step() over budget'); process.exit(1); }
