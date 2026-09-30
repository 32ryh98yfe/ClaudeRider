// Shared helpers for trackc tests: in-memory bakes (cached per file), drivability sweeps, locate walks.
import { readFileSync } from 'node:fs';
import { SURFACE_IDS } from '@cr/content';
import { loadCtrk, toArrayBuffer, type BakedTrack, type Contact, type GroundHit, type TrackLoc, type FrameSample } from '@cr/sim';
import { buildTrack, type BuildOptions, type BuildResult } from '../src/build.ts';

export const TRACKS = new URL('../../../tracks/', import.meta.url).pathname;
const cache = new Map<string, BuildResult>();

export function bake(rel: string, opts: BuildOptions = {}): BuildResult {
  const key = rel + JSON.stringify(opts);
  let r = cache.get(key);
  if (!r) { const file = TRACKS + rel; r = buildTrack(readFileSync(file, 'utf8'), file, opts); cache.set(key, r); }
  return r;
}
export function bakeSrc(src: string, opts: BuildOptions = {}): BuildResult { return buildTrack(src, 'inline.ctd', { terrain: false, props: false, ...opts }); }
export function reload(r: BuildResult): BakedTrack { return loadCtrk(toArrayBuffer(r.ctrk)); }

export const hit = (): GroundHit => ({ t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 });
export const contacts = (): Contact[] => Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0, flags: 0, tri: 0 }));
export const frame = (): FrameSample => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 });
export const surfCode = (id: (typeof SURFACE_IDS)[number]): number => SURFACE_IDS.indexOf(id) + 1;

/** Surface code under a point at lateral offset d of path p at s (ray from 1 m above). */
export function surfaceAt(t: BakedTrack, p: number, s: number, d: number): number {
  const f = frame(); t.frameAt(p, s, f);
  const h = hit();
  const x = f.px + f.rx * d, y = f.py + f.ry * d, z = f.pz + f.rz * d;
  return t.groundRay(x + f.ux * 1.5, y + f.uy * 1.5, z + f.uz * 1.5, -f.ux, -f.uy, -f.uz, 3, h) ? h.surf : 0;
}

/** Sweeps a kart-sized sphere along a path at lateral offsets; returns the first problem found. */
export function sweep(t: BakedTrack, p: number, offsets: number[], s0 = 0, s1 = Infinity, step = 1): string | null {
  const pm = t.path(p), f = frame(), h = hit(), cs = contacts();
  const end = Math.min(s1, pm.length);
  for (let s = s0; s <= end; s += step) {
    t.frameAt(p, s, f);
    if (f.flags & ((1 << 10) | (1 << 13))) continue; // no-ground / warp spans
    for (const k of offsets) {
      const d = k * Math.min(f.wL, f.wR);
      const x = f.px + f.rx * d, y = f.py + f.ry * d, z = f.pz + f.rz * d;
      if (!t.groundRay(x + f.ux, y + f.uy, z + f.uz, -f.ux, -f.uy, -f.uz, 2, h)) return `no ground at ${pm.id} s=${s.toFixed(1)} d=${d.toFixed(1)}`;
      const n = t.sphereWalls(h.x + h.nx * 0.6, h.y + h.ny * 0.6, h.z + h.nz * 0.6, 0.85, cs, 8);
      if (n > 0) return `wall contact at ${pm.id} s=${s.toFixed(1)} d=${d.toFixed(1)} depth ${cs[0]!.depth.toFixed(2)}`;
    }
  }
  return null;
}

/** Walks world points through locate() and records (path, sMain) per step. */
export function locateWalk(t: BakedTrack, pts: { x: number; y: number; z: number }[], start: TrackLoc): { ok: boolean; paths: number[]; sMain: number[]; maxJump: number } {
  const prev: TrackLoc = { ...start }, out: TrackLoc = { ...start };
  const paths: number[] = [], sMain: number[] = [];
  let ok = true, maxJump = 0;
  for (const q of pts) {
    if (!t.locate(q.x, q.y + 0.2, q.z, prev, out)) { ok = false; break; }
    if (sMain.length) { let d = Math.abs(out.sMain - sMain[sMain.length - 1]!); if (t.topology === 'circuit') d = Math.min(d, t.lapLength - d); maxJump = Math.max(maxJump, d); }
    paths.push(out.path); sMain.push(out.sMain);
    Object.assign(prev, out);
  }
  return { ok, paths, sMain, maxJump };
}
