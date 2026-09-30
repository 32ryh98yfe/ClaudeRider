// Spline routes for item objects (ADR-010): positions are (path, D, u, h) with D a race distance, so homing needs no
// breadcrumbs and nothing extra to snapshot. Branch paths map affinely onto main-line progress (ADR-006).
import type { BakedTrack, FrameSample } from '../track/BakedTrack.ts';

export const frameScratch = (): FrameSample => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 });

/** Main-line progress of a race distance. */
export function sMainOf(T: BakedTrack, D: number): number {
  if (T.topology !== 'circuit') return D;
  const L = T.lapLength;
  return D - L * Math.floor(D / L);
}

/** Does branch `path` cover main-line progress `sm`? (Always true for the main path.) */
export function pathCovers(T: BakedTrack, path: number, sm: number): boolean {
  if (path === 0) return true;
  if (path >= T.nPaths) return false;
  const map = T.path(path).map;
  if (!map) return false;
  const L0 = T.path(0).length;
  let from = map.fromS, to = map.toS, s = sm;
  if (to < from) { to += L0; if (s < from) s += L0; }
  return s >= from && s <= to;
}

/** Path-local arc length for main-line progress `sm` (inverse of BakedTrack.toMainS). */
export function pathS(T: BakedTrack, path: number, sm: number): number {
  if (path === 0) return sm;
  const pm = T.path(path);
  const map = pm.map;
  if (!map) return 0;
  const L0 = T.path(0).length;
  let from = map.fromS, to = map.toS, s = sm;
  if (to < from) { to += L0; if (s < from) s += L0; }
  const span = to - from;
  return span > 1e-9 ? ((s - from) / span) * pm.length : 0;
}

/** World position of the route point (path, D, u, h) into `out`; returns the (possibly corrected) path. */
export function routePoint(T: BakedTrack, path: number, D: number, u: number, h: number, F: FrameSample, out: { x: number; y: number; z: number }): number {
  const sm = sMainOf(T, D);
  const p = pathCovers(T, path, sm) ? path : 0;
  T.frameAt(p, pathS(T, p, sm), F);
  out.x = F.px + F.rx * u + F.ux * h;
  out.y = F.py + F.ry * u + F.uy * h;
  out.z = F.pz + F.rz * u + F.uz * h;
  return p;
}
