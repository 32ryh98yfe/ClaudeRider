// Cross-section profiles (docs/design/11-track-spec.md §3 ProfileDef). A profile maps the road span to a polyline
// of (d, h) points; `flat` is the plain road. Profiles are canonicalised to 17 vertices so rows zip cleanly.
import { SURFACE_IDS, type SurfaceId } from '@cr/content';
import { TrackDslError, num, pairList, type Stmt } from './dsl.ts';

export const PROFILE_VERTS = 17;

export interface ProfilePoint { d: number; h: number; surf: SurfaceId | null }
export interface ProfileDef {
  id: string;
  kind: 'flat' | 'halfpipe' | 'custom';
  crown: number;
  /** canonical vertices left → right (absolute metres); empty for flat */
  pts: ProfilePoint[];
  /** footprint width (m): the road width while the profile is fully applied */
  width: number;
  /** max slope (deg) of any profile segment — V-checks: ≤ 60° counts as ground */
  maxSlopeDeg: number;
  src: Record<string, number | string>;
}

const FLAT: ProfileDef = { id: 'flat', kind: 'flat', crown: 0, pts: [], width: 0, maxSlopeDeg: 0, src: {} };

/** Resamples a polyline to `n` vertices by arc length, keeping both ends. */
function canonical(pts: ProfilePoint[], n = PROFILE_VERTS): ProfilePoint[] {
  const L: number[] = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1]! + Math.hypot(pts[i]!.d - pts[i - 1]!.d, pts[i]!.h - pts[i - 1]!.h));
  const total = L[L.length - 1]!;
  const out: ProfilePoint[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * total;
    while (j < pts.length - 2 && L[j + 1]! < s) j++;
    const seg = L[j + 1]! - L[j]!;
    const t = seg > 1e-9 ? (s - L[j]!) / seg : 0;
    const a = pts[j]!, b = pts[j + 1]!;
    out.push({ d: a.d + (b.d - a.d) * t, h: a.h + (b.h - a.h) * t, surf: t < 0.5 ? a.surf : b.surf });
  }
  return out;
}

function slopeOf(pts: ProfilePoint[]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const dd = Math.abs(pts[i]!.d - pts[i - 1]!.d), dh = Math.abs(pts[i]!.h - pts[i - 1]!.h);
    m = Math.max(m, (Math.atan2(dh, dd) * 180) / Math.PI);
  }
  return m;
}

/** Halfpipe: flat floor ±floorHalf, fillet arcs of radius filletR up to wallDeg, straight walls to wallH, optional lip. */
export function halfpipe(id: string, floorHalf: number, filletR: number, wallDeg: number, wallH: number, lip: number, sides: 'both' | 'L' | 'R'): ProfileDef {
  const a = (wallDeg * Math.PI) / 180;
  const side = (sg: -1 | 1, on: boolean): ProfilePoint[] => {
    const pts: ProfilePoint[] = [];
    if (!on) { pts.push({ d: sg * (floorHalf + filletR * Math.sin(a)), h: 0, surf: null }); return pts; }
    for (let k = 1; k <= 8; k++) {
      const t = (a * k) / 8;
      pts.push({ d: sg * (floorHalf + filletR * Math.sin(t)), h: filletR * (1 - Math.cos(t)), surf: null });
    }
    const hF = filletR * (1 - Math.cos(a));
    if (wallH > hF) pts.push({ d: sg * (floorHalf + filletR * Math.sin(a) + (wallH - hF) / Math.tan(a)), h: wallH, surf: null });
    if (lip > 0) pts.push({ d: pts[pts.length - 1]!.d + sg * lip, h: pts[pts.length - 1]!.h, surf: null });
    return pts;
  };
  const left = side(-1, sides !== 'R').reverse();
  const right = side(1, sides !== 'L');
  const raw = [...left, { d: -floorHalf, h: 0, surf: null }, { d: floorHalf, h: 0, surf: null }, ...right];
  const pts = canonical(raw);
  return { id, kind: 'halfpipe', crown: 0, pts, width: pts[pts.length - 1]!.d - pts[0]!.d, maxSlopeDeg: slopeOf(raw), src: { floorHalf, filletR, wallDeg, wallH, lip, sides } };
}

export const BUILTIN_PROFILES: Record<string, ProfileDef> = {
  flat: FLAT,
  // gap-3 hp60: floorHalf 5, fillet R6, walls 60°, wallH 4.5 → footprint 22.1 m
  hp60: halfpipe('hp60', 5, 6, 60, 4.5, 0, 'both'),
};

/** PROFILE <id> flat crown=0.15 | halfpipe floorHalf= filletR= wallDeg= wallH= [lip=] [sides=] | custom pts=[d:h[:surf],…] */
export function parseProfile(st: Stmt, file: string): ProfileDef {
  const id = st.args[0];
  const kind = st.args[1];
  const fail = (msg: string): never => { throw new TrackDslError({ file, line: st.line, col: 1, msg }); };
  if (!id || !kind) fail('PROFILE <id> flat|halfpipe|custom …');
  const a = st.attrs;
  if (kind === 'flat') return { ...FLAT, id: id!, crown: num(a.crown, 0), src: { crown: num(a.crown, 0) } };
  if (kind === 'halfpipe') {
    const wallDeg = num(a.wallDeg, 60);
    if (wallDeg > 60) fail(`halfpipe wallDeg ${wallDeg}° > 60° (steeper surfaces are walls, not ground)`);
    const sides = (a.sides ?? 'both') as 'both' | 'L' | 'R';
    return halfpipe(id!, num(a.floorHalf, 5), num(a.filletR, 6), wallDeg, num(a.wallH, 4.5), num(a.lip, 0), sides);
  }
  if (kind === 'custom') {
    const raw = pairList(a.pts).map(([d, rest]) => {
      const [h, s] = rest.split(':');
      if (s && !(SURFACE_IDS as readonly string[]).includes(s)) fail(`unknown surface ${s}`);
      return { d: Number(d), h: Number(h), surf: (s as SurfaceId | undefined) ?? null };
    });
    if (raw.length < 2 || raw.some((p) => !Number.isFinite(p.d) || !Number.isFinite(p.h))) fail('custom profile needs pts=[d:h,…] with ≥ 2 points');
    for (let i = 1; i < raw.length; i++) if (!(raw[i]!.d > raw[i - 1]!.d)) fail('custom profile points must have increasing d');
    const maxSlope = slopeOf(raw);
    if (maxSlope > 60 + 1e-6) fail(`custom profile slope ${maxSlope.toFixed(1)}° > 60°`);
    const pts = canonical(raw);
    return { id: id!, kind: 'custom', crown: 0, pts, width: pts[pts.length - 1]!.d - pts[0]!.d, maxSlopeDeg: maxSlope, src: { pts: a.pts ?? '' } };
  }
  return fail(`unknown profile kind ${kind} (flat | halfpipe | custom)`);
}
