// Reproducible map-compatibility probe: pnpm bake, then
// node tools/bench/reference-driving.ts /tmp/driving.json
// Run on both revisions with the same baked maps to compare transient-control changes.
// The expanded fidelity-era acceptance matrix (both supported modes, solo + 8-kart fields, three seeds,
// incident locations and baseline deltas) is tools/reference/map-matrix.ts. This small legacy probe remains
// useful for comparing the earlier single-Legend result without silently changing that report's meaning.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadContent, type TrackId } from '@cr/content';
import { loadCtrk, toArrayBuffer, SIM_VERSION } from '@cr/sim';
import { runRace } from '@cr/sim/ai/balance.ts';

const output = process.argv[2];
if (!output) throw new Error('Usage: node tools/bench/reference-driving.ts <output.json>');
const content = loadContent();
const directory = new URL('../../apps/client/public/tracks/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', directory), 'utf8')) as Record<string, unknown>;
const bot = { tier: 'legend', character: 'clay', kart: 'pebble', noJitter: true } as const;
const tracks = Object.keys(index).sort().map((id) => {
  const bytes = readFileSync(new URL(`${id}.ctrk`, directory));
  const track = loadCtrk(toArrayBuffer(bytes));
  const mode = content.tracks.get(id as TrackId).modes.includes('speed') ? 'speed' : 'item';
  const result = runRace({ track, content, bots: [bot], seed: 4242, laps: 1, lookahead: 8, mode });
  const kart = result.karts[0]!;
  return {
    id, mode, trackHash: track.hash, sha256: createHash('sha256').update(bytes).digest('hex'),
    finished: kart.finished, seconds: kart.raceTicks / 60,
    wallHits: kart.wallHits, hardHits: kart.hardHits, respawns: kart.respawns,
    drifts: kart.drifts, cuts: kart.cuts, maxStuckTicks: kart.maxStuckTicks,
    drags: kart.drags, taps: kart.taps, spinOuts: kart.spinOuts, brakeTurns: kart.brakeTurns,
  };
});
writeFileSync(output, JSON.stringify({ simVersion: SIM_VERSION, seed: 4242, laps: 1, lookahead: 8, bot, tracks }, null, 2) + '\n');
console.log(`${tracks.filter((t) => t.finished).length}/${tracks.length} finished; results: ${output}`);
if (tracks.some((t) => !t.finished || t.hardHits > 0 || t.respawns > 0 || t.spinOuts > 0)) process.exitCode = 1;
