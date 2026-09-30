// Headless race: node tools/bench/race.ts <trackId> [mode] [tier] [laps]
import { readFileSync } from 'node:fs';
import { loadContent } from '@cr/content';
import { createWorld, loadCtrk, toArrayBuffer, makeContext, step, createAiDriver, AI_TIERS, makeInput, ArraySink, hashWorld, Phase, raceTicksOf, KMH_PER_MPS, type RaceConfig, type InputFrame, type SimEvent } from '@cr/sim';

const [id = 'meadow_loop', mode = 'speed', tier = 'pro', lapsArg] = process.argv.slice(2);
const buf = toArrayBuffer(readFileSync(new URL(`../../apps/client/public/tracks/${id}.ctrk`, import.meta.url)));
const track = loadCtrk(buf);
const content = loadContent();
const chars = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const karts = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
const cfg: RaceConfig = {
  simVersion: 1, mode: mode as 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: lapsArg ? Number(lapsArg) : track.laps,
  slots: chars.map((c, i) => ({ kind: 'bot' as const, team: 0, name: c, characterId: c, kartBodyId: karts[i]!, ai: tier as 'pro', vMul: AI_TIERS[tier as 'pro'].vMul })),
  seed: 1234, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 60, countdownTicks: 180,
};
const w = createWorld(cfg, track, content);
const sink = new ArraySink();
const ctx = makeContext({ track, cfg, content, role: 'authority', events: sink });
const drivers = cfg.slots.map((_, i) => createAiDriver(track, content, i, AI_TIERS[tier as 'pro'], {}, 99 + i));
const inputs: InputFrame[] = cfg.slots.map(() => makeInput());
const t0 = performance.now();
const maxTicks = 60 * 60 * 8;
let walls = 0, hard = 0;
const evs: SimEvent[] = [];
while (w.phase !== Phase.DONE && w.tick < maxTicks) {
  for (let i = 0; i < 8; i++) drivers[i]!.decide(w, inputs[i]!);
  step(w, inputs, ctx);
  sink.drain(evs);
}
const ms = performance.now() - t0;
for (const e of evs) if (e.t === 'wall') { walls++; if (e.severity === 2) hard++; }
console.log(`${id} ${mode} ${tier}: ${w.tick} ticks in ${ms.toFixed(0)} ms (${(ms * 1000 / w.tick / 8).toFixed(2)} µs/kart-tick incl. AI), hash ${hashWorld(w).toString(16)}`);
const byRank = [...w.karts].sort((a, b) => a.race.rank - b.race.rank);
for (const k of byRank) {
  const t = raceTicksOf(w, k) / 60;
  console.log(`  #${k.race.rank} ${cfg.slots[k.slot]!.name.padEnd(7)} ${k.race.finishTick >= 0 ? t.toFixed(2) + 's' : 'RETIRE'} best lap ${(k.race.bestLapTicks / 60).toFixed(2)}s drifts ${k.stats.drifts} inst ${k.stats.instantBoosts} boosts ${k.stats.boostsUsed} walls ${k.stats.wallHits}/${k.stats.hardHits} respawns ${k.stats.respawns} start ${k.stats.startTier} v ${(Math.hypot(k.body.vx, k.body.vz) * KMH_PER_MPS).toFixed(0)}km/h lap ${k.race.lap}`);
}
console.log(`  wall events ${walls} (hard ${hard})`);
