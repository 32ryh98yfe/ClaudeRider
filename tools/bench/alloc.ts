// Allocation profile of step(): replays a recorded 8-bot race under V8's sampling heap profiler, counting objects
// that die young too, and prints the top allocation sites. A clean hot path allocates only event objects.
// Usage: node tools/bench/alloc.ts [trackId=meadow_loop] [ticks=3000]
import { Session } from 'node:inspector/promises';
import { readFileSync, existsSync } from 'node:fs';
import { loadContent } from '@cr/content';
import { buildTrack } from '@cr/trackc/build.ts';
import { AI_TIERS, NULL_SINK, createAiDriver, createWorld, loadCtrk, makeContext, makeInput, packInput, step, toArrayBuffer, unpackInput, type BakedTrack, type InputFrame, type RaceConfig } from '@cr/sim';

const [id = 'meadow_loop', ticksArg = '3000'] = process.argv.slice(2);
const root = new URL('../../', import.meta.url);
const T: BakedTrack = existsSync(new URL(`apps/client/public/tracks/${id}.ctrk`, root))
  ? loadCtrk(toArrayBuffer(readFileSync(new URL(`apps/client/public/tracks/${id}.ctrk`, root))))
  : buildTrack(readFileSync(new URL(`tracks/clayhill_village/${id}.ctd`, root), 'utf8'), id).track;
const content = loadContent();
const karts = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
const cfg: RaceConfig = {
  simVersion: 1, mode: 'speed', teams: 'solo', trackId: T.id, trackHash: T.hash, laps: T.laps,
  slots: karts.map((kb, i) => ({ kind: 'bot' as const, team: 0, name: `b${i}`, characterId: 'clay' as const, kartBodyId: kb, ai: 'pro' as const, vMul: 1 })),
  seed: 1234, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180,
};
const ticks = Number(ticksArg);
const w0 = createWorld(cfg, T, content), ctx0 = makeContext({ track: T, cfg, content, role: 'authority', events: NULL_SINK });
const drivers = cfg.slots.map((_, i) => createAiDriver(T, content, i, AI_TIERS.pro, {}, 99 + i));
const inp: InputFrame[] = cfg.slots.map(() => makeInput());
const log: number[] = [];
for (let t = 0; t < ticks; t++) { for (let i = 0; i < 8; i++) { drivers[i]!.decide(w0, inp[i]!); log.push(packInput(inp[i]!)); } step(w0, inp, ctx0); }

const w = createWorld(cfg, T, content), ctx = makeContext({ track: T, cfg, content, role: 'authority', events: NULL_SINK });
const frames: InputFrame[] = cfg.slots.map(() => makeInput());
for (let t = 0; t < 600; t++) { for (let i = 0; i < 8; i++) unpackInput(log[t * 8 + i]!, frames[i]!); step(w, frames, ctx); } // warm up
const s = new Session();
s.connect();
await s.post('HeapProfiler.enable');
await s.post('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
for (let t = 600; t < ticks; t++) { for (let i = 0; i < 8; i++) unpackInput(log[t * 8 + i]!, frames[i]!); step(w, frames, ctx); }
const { profile } = await s.post('HeapProfiler.stopSampling') as unknown as { profile: { head: Node; samples: { size: number; nodeId: number }[] } };
interface Node { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children: Node[] }
const byId = new Map<number, Node>();
const index = (n: Node): void => { byId.set(n.id, n); for (const c of n.children) index(c); };
index(profile.head);
const sites = new Map<string, number>();
let total = 0;
for (const smp of profile.samples) {
  const cf = byId.get(smp.nodeId)!.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
  sites.set(key, (sites.get(key) ?? 0) + smp.size); total += smp.size;
}
const n = ticks - 600;
console.log(`${id}: ≈ ${(total / n).toFixed(0)} bytes allocated per tick (8 karts), sampled`);
for (const [k, v] of [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${(v / n).toFixed(0).padStart(8)} B/tick  ${k}`);
