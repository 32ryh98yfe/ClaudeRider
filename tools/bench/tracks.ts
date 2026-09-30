// Runs one 8-bot race per shipped track (every manifest track whose DSL exists and bakes) and prints finishers,
// winner time, the longest stall, respawns and hard wall hits per bot-lap, and the worst single-kart respawn count
// (a respawn loop shows up there). Usage: node tools/bench/tracks.ts [speed|item] [tier]
import { existsSync } from 'node:fs';
import { AI_TIERS, Phase, raceTicksOf } from '@cr/sim';
import { bakedTrack, getContent, makeRig } from '../../packages/sim/test/rig.ts';

const mode = (process.argv[2] ?? 'speed') as 'speed' | 'item';
const tier = (process.argv[3] ?? 'pro') as 'pro' | 'racer';
const ROOT = new URL('../../', import.meta.url);
const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;

for (const t of getContent().tracks.all) {
  const rel = `${t.themeId}/${t.id}`;
  if (!t.modes.includes(mode) || !existsSync(new URL(`tracks/${rel}.ctd`, ROOT))) continue;
  let track;
  try { track = bakedTrack(rel); } catch (e) { console.log(`${t.id.padEnd(22)} bake failed: ${String(e).slice(0, 90)}`); continue; }
  const slots = CHARS.map((c, i) => ({ kind: 'bot' as const, characterId: c, kartBodyId: KARTS[i]!, name: c, ai: tier, vMul: AI_TIERS[tier].vMul }));
  const rig = makeRig(track, { mode, slots, seed: 4242 });
  const w = rig.w;
  const lastDist = new Float64Array(8).fill(-1e9), lastMove = new Int32Array(8);
  let maxStuck = 0;
  const t0 = Date.now();
  while (w.phase !== Phase.DONE && w.tick < 60 * 60 * 6) {
    rig.tick();
    if (w.phase < Phase.RACING) continue;
    for (const k of w.karts) {
      if (k.race.finishTick >= 0) { lastMove[k.slot] = w.tick; continue; }
      if (k.race.raceDist > lastDist[k.slot]! + 2) { lastDist[k.slot] = k.race.raceDist; lastMove[k.slot] = w.tick; }
      maxStuck = Math.max(maxStuck, w.tick - lastMove[k.slot]!);
    }
  }
  const fin = w.karts.filter((k) => k.race.finishTick >= 0);
  const winner = fin.length ? Math.min(...fin.map((k) => raceTicksOf(w, k))) / 60 : NaN;
  const resp = w.karts.map((k) => k.stats.respawns), hard = w.karts.reduce((a, k) => a + k.stats.hardHits, 0);
  const bl = 8 * rig.cfg.laps;
  console.log(`${t.id.padEnd(22)} fin ${fin.length}/8  win ${winner.toFixed(1).padStart(6)} s  stall ${(maxStuck / 60).toFixed(1).padStart(5)} s  resp/bot-lap ${(resp.reduce((a, b) => a + b, 0) / bl).toFixed(2)}  max resp ${Math.max(...resp)}  hard/bot-lap ${(hard / bl).toFixed(2)}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
