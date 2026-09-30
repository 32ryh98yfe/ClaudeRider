// Spline routes for item objects (ADR-010): positions are (path, D, u, h) with D a race distance, so homing needs no
// breadcrumbs and nothing extra to snapshot. Paths map affinely onto main-line progress (ADR-006); the inverse is
// calibrated from BakedTrack.toMainS itself (per path, once), so it follows whatever offsets the track runtime uses
// (e.g. a point-to-point start-line offset on the main path).
import type { BakedTrack, FrameSample } from '../track/BakedTrack.ts';

export const frameScratch = (): FrameSample => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 });

/** Main-line progress of a race distance. */
export function sMainOf(T: BakedTrack, D: number): number {
  if (T.topology !== 'circuit') return D;
  const L = T.lapLength;
  return D - L * Math.floor(D / L);
}

/** Per path: sMain at s = 0 (`a`) and at s = length (`b`, unwrapped past the line on circuits), path length. */
interface PathMap { a: number; b: number; len: number; ok: boolean }
const MAPS = new WeakMap<BakedTrack, PathMap[]>();
function mapOf(T: BakedTrack, path: number): PathMap {
  let m = MAPS.get(T);
  if (!m) {
    m = [];
    const L = T.lapLength;
    for (let p = 0; p < T.nPaths; p++) {
      const pm = T.path(p);
      const ok = p === 0 || pm.map !== undefined;
      const a = ok ? T.toMainS(p, 0) : 0;
      let b = ok ? T.toMainS(p, pm.length) : 0;
      if (T.topology === 'circuit' && p !== 0 && b < a) b += L;
      if (p === 0) b = a + pm.length;
      m.push({ a, b, len: pm.length, ok });
    }
    MAPS.set(T, m);
  }
  return m[path] ?? { a: 0, b: 0, len: 0, ok: false };
}

/** Unwraps `sm` into the [a, b] window of a circuit branch that crosses the line. */
function unwrap(T: BakedTrack, m: PathMap, sm: number): number {
  return T.topology === 'circuit' && m.b > T.lapLength && sm < m.a ? sm + T.lapLength : sm;
}

/** Does `path` cover main-line progress `sm`? (Always true for the main path.) */
export function pathCovers(T: BakedTrack, path: number, sm: number): boolean {
  if (path === 0) return true;
  if (path >= T.nPaths) return false;
  const m = mapOf(T, path);
  if (!m.ok) return false;
  const s = unwrap(T, m, sm);
  return s >= m.a && s <= m.b;
}

/** Path-local arc length for main-line progress `sm` (inverse of BakedTrack.toMainS). */
export function pathS(T: BakedTrack, path: number, sm: number): number {
  const m = mapOf(T, path);
  if (!m.ok) return 0;
  if (path === 0) return sm - m.a;
  const span = m.b - m.a;
  return span > 1e-9 ? ((unwrap(T, m, sm) - m.a) / span) * m.len : 0;
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
