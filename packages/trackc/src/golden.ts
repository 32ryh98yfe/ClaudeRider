// Golden bake hashes (tracks/golden.json): for every committed track, the hash of its source and of its default bake
// (.ctrk meta hash, .vis FNV). packages/trackc/test/build.test.ts fails when a track whose source is unchanged bakes
// to different bytes, i.e. when a compiler, sim-track or content change moved the output. If that was intended:
//   node packages/trackc/src/golden.ts --update
// A track whose source changed since the golden was written is reported as stale, not failed (world lanes edit
// their tracks freely); `--update` refreshes it.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPILER_VERSION, buildTrack, type BuildResult } from './build.ts';

export const TRACKS_DIR = new URL('../../../tracks/', import.meta.url).pathname;
export const GOLDEN_FILE = join(TRACKS_DIR, 'golden.json');

export interface GoldenEntry { src: string; ctrk: string; vis: string }
export interface Golden { compiler: string; note: string; tracks: Record<string, GoldenEntry> }

const fnv = (bytes: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
export const srcHash = (src: string): string => createHash('sha256').update(src).digest('hex').slice(0, 16);
export const entryOf = (src: string, r: BuildResult): GoldenEntry => ({ src: srcHash(src), ctrk: r.meta.hash, vis: fnv(r.vis) });

/** Every committed .ctd, as `dir/name` relative to tracks/ (fixtures included). */
export function allTrackIds(d = TRACKS_DIR, rel = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(d).sort()) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) out.push(...allTrackIds(p, rel + e + '/'));
    else if (e.endsWith('.ctd')) out.push(rel + e.slice(0, -4));
  }
  return out;
}

export function readGolden(): Golden {
  try { return JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as Golden; } catch { return { compiler: COMPILER_VERSION, note: '', tracks: {} }; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const update = process.argv.includes('--update');
  const g = readGolden();
  const next: Golden = { compiler: COMPILER_VERSION, note: 'default buildTrack() bakes (no AO/PVS); regenerate with node packages/trackc/src/golden.ts --update', tracks: {} };
  let changed = 0;
  for (const id of allTrackIds()) {
    const src = readFileSync(join(TRACKS_DIR, id + '.ctd'), 'utf8');
    let e: GoldenEntry;
    try { e = entryOf(src, buildTrack(src, join(TRACKS_DIR, id + '.ctd'))); } catch (err) { console.log(`  skip ${id}: ${(err as Error).message.split('\n')[0]}`); continue; }
    next.tracks[id] = e;
    const old = g.tracks[id];
    const same = old && old.src === e.src && old.ctrk === e.ctrk && old.vis === e.vis;
    if (!same) { changed++; console.log(`${old ? (old.src === e.src ? 'CHANGED' : 'stale  ') : 'new    '} ${id}  ctrk ${e.ctrk} vis ${e.vis}`); }
  }
  if (update) { writeFileSync(GOLDEN_FILE, JSON.stringify(next, null, 1) + '\n'); console.log(`wrote ${GOLDEN_FILE} (${Object.keys(next.tracks).length} tracks, ${changed} changed)`); }
  else { console.log(`${changed} track(s) differ from ${GOLDEN_FILE}${changed ? ' (--update to accept)' : ''}`); process.exit(changed ? 1 : 0); }
}
