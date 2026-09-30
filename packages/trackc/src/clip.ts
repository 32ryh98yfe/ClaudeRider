// 2D footprint clipping (plan view, x/z): ground and render triangles are cut against another surface's footprint
// with polygon-clipping (only triangles that straddle the footprint edge are re-triangulated), wall panels are cut
// segment-wise. Used for junction gores (BRANCH split/merge) and AREA plazas.
import polygonClipping from 'polygon-clipping';
import { ShapeUtils, Vector2 } from 'three';
import { TFLAG } from '@cr/sim';
import { sampleAt, type PathModel, type TrackModel } from './paths.ts';
import { profileHeight } from './content.ts';
import { TriSoup, VS, type WallQuad } from './soup.ts';
import { ROLE } from './mesh.ts';

export type Ring = [number, number][];
export interface Footprint { rings: Ring[]; bbox: [number, number, number, number] } // outer rings (no holes)

export function footprint(rings: Ring[]): Footprint {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of rings) for (const [x, z] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { rings, bbox: [x0, z0, x1, z1] };
}

/** Plan footprint of a path between s0 and s1: 'road' (±w/2) or 'full' (road + shoulders). */
export function pathRing(m: TrackModel, p: PathModel, s0: number, s1: number, mode: 'road' | 'full', grow = 0): Ring {
  const n = Math.max(2, Math.ceil((s1 - s0) / 1));
  const left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const smp = sampleAt(p, s0 + ((s1 - s0) * i) / n);
    const W = smp.w / 2;
    const dl = -(W + (mode === 'full' ? smp.shL : 0) + grow), dr = W + (mode === 'full' ? smp.shR : 0) + grow;
    const pr = m.profiles.get(smp.prof);
    const hl = profileHeight(pr, smp, dl), hr = profileHeight(pr, smp, dr);
    left.push([smp.x + smp.rx * dl + smp.ux * hl, smp.z + smp.rz * dl + smp.uz * hl]);
    right.push([smp.x + smp.rx * dr + smp.ux * hr, smp.z + smp.rz * dr + smp.uz * hr]);
  }
  const ring: Ring = [...left, ...right.reverse()];
  ring.push(ring[0]!);
  return ring;
}

function pointInRing(x: number, z: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i]![0], zi = r[i]![1], xj = r[j]![0], zj = r[j]![1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function inFootprint(x: number, z: number, f: Footprint): boolean {
  if (x < f.bbox[0] || x > f.bbox[2] || z < f.bbox[1] || z > f.bbox[3]) return false;
  for (const r of f.rings) if (pointInRing(x, z, r)) return true;
  return false;
}

function segCross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number {
  // returns t along a→b of the intersection with c→d, or −1
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return -1;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1 ? t : -1;
}

function triCrosses(P: number[][], f: Footprint): boolean {
  for (const r of f.rings) for (let i = 0; i + 1 < r.length; i++) {
    const c = r[i]!, d = r[i + 1]!;
    for (let e = 0; e < 3; e++) {
      const a = P[e]!, b = P[(e + 1) % 3]!;
      if (segCross(a[0]!, a[2]!, b[0]!, b[2]!, c[0], c[1], d[0], d[1]) >= 0) return true;
    }
  }
  return false;
}

/** Subtracts footprint `f` from every soup triangle selected by `pick`. Returns the number of triangles touched. */
export function subtractFromSoup(soup: TriSoup, pick: (t: number) => boolean, f: Footprint): number {
  let touched = 0;
  const out = new TriSoup();
  const clipGeom = f.rings.map((r) => [r] as [number, number][][]);
  for (let t = 0; t < soup.count; t++) {
    const P = [soup.vert(t, 0), soup.vert(t, 1), soup.vert(t, 2)];
    const keepAll = (): void => out.push(P[0]!, P[1]!, P[2]!, soup.surf[t]!, soup.flg[t]!, soup.path[t]!, soup.role[t]!);
    if (!pick(t)) { keepAll(); continue; }
    const tx0 = Math.min(P[0]![0]!, P[1]![0]!, P[2]![0]!), tx1 = Math.max(P[0]![0]!, P[1]![0]!, P[2]![0]!);
    const tz0 = Math.min(P[0]![2]!, P[1]![2]!, P[2]![2]!), tz1 = Math.max(P[0]![2]!, P[1]![2]!, P[2]![2]!);
    if (tx1 < f.bbox[0] || tx0 > f.bbox[2] || tz1 < f.bbox[1] || tz0 > f.bbox[3]) { keepAll(); continue; }
    const ins = P.map((v) => inFootprint(v[0]!, v[2]!, f));
    const crosses = triCrosses(P, f);
    if (!crosses && ins.every((x) => !x)) {
      // the footprint may still sit entirely inside a big triangle: test one footprint vertex
      const r0 = f.rings[0]![0]!;
      if (!pointInTri(r0[0], r0[1], P)) { keepAll(); continue; }
    }
    if (!crosses && ins.every((x) => x)) { touched++; continue; } // fully covered → drop
    touched++;
    const tri: [number, number][] = P.map((v) => [v[0]!, v[2]!] as [number, number]);
    tri.push(tri[0]!);
    let res: [number, number][][][];
    try { res = polygonClipping.difference([tri], ...clipGeom) as [number, number][][][]; } catch { keepAll(); continue; }
    emitPieces(res, P, soup.surf[t]!, soup.flg[t]!, soup.path[t]!, soup.role[t]!, out);
  }
  soup.v = out.v; soup.surf = out.surf; soup.flg = out.flg; soup.path = out.path; soup.role = out.role;
  return touched;
}

function pointInTri(x: number, z: number, P: number[][]): boolean {
  const s = (a: number[], b: number[]): number => (b[0]! - a[0]!) * (z - a[2]!) - (b[2]! - a[2]!) * (x - a[0]!);
  const d1 = s(P[0]!, P[1]!), d2 = s(P[1]!, P[2]!), d3 = s(P[2]!, P[0]!);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Triangulates clipped pieces and interpolates every vertex attribute barycentrically in the source triangle. */
function emitPieces(res: [number, number][][][], P: number[][], surf: number, flg: number, path: number, role: number, out: TriSoup): void {
  const [A, B, C] = P as [number[], number[], number[]];
  const det = (B[0]! - A[0]!) * (C[2]! - A[2]!) - (C[0]! - A[0]!) * (B[2]! - A[2]!);
  if (Math.abs(det) < 1e-12) return;
  const bary = (x: number, z: number): number[] => {
    const l1 = ((x - A[0]!) * (C[2]! - A[2]!) - (C[0]! - A[0]!) * (z - A[2]!)) / det;
    const l2 = ((B[0]! - A[0]!) * (z - A[2]!) - (x - A[0]!) * (B[2]! - A[2]!)) / det;
    const l0 = 1 - l1 - l2;
    const v: number[] = [];
    for (let k = 0; k < VS; k++) v.push(A[k]! * l0 + B[k]! * l1 + C[k]! * l2);
    // renormalise the interpolated normal
    const nl = Math.hypot(v[3]!, v[4]!, v[5]!) || 1; v[3]! /= nl; v[4]! /= nl; v[5]! /= nl;
    return v;
  };
  for (const poly of res) {
    const strip = (r: [number, number][]): Vector2[] => { const q = r.slice(0, r.length - 1).map(([x, z]) => new Vector2(x, z)); return q; };
    const contour = strip(poly[0]!);
    const holes = poly.slice(1).map(strip);
    if (contour.length < 3) continue;
    const all = [...contour, ...holes.flat()];
    const faces = ShapeUtils.triangulateShape(contour, holes);
    for (const f of faces) {
      const a = all[f[0]!]!, b = all[f[1]!]!, c = all[f[2]!]!;
      let va = bary(a.x, a.y), vb = bary(b.x, b.y);
      const vc = bary(c.x, c.y);
      // keep the source winding (front face up): compare the plan-view orientation sign
      const s0 = (B[2]! - A[2]!) * (C[0]! - A[0]!) - (B[0]! - A[0]!) * (C[2]! - A[2]!);
      const s1 = (vb[2]! - va[2]!) * (vc[0]! - va[0]!) - (vb[0]! - va[0]!) * (vc[2]! - va[2]!);
      if (s0 * s1 < 0) { const tmp = va; va = vb; vb = tmp; }
      out.push(va, vb, vc, surf, flg, path, role);
    }
  }
}

/** Cuts wall panels selected by `pick` where their base segment runs inside footprint `f`. */
export function subtractFromWalls(walls: WallQuad[], pick: (w: WallQuad) => boolean, f: Footprint): WallQuad[] {
  const out: WallQuad[] = [];
  for (const w of walls) {
    if (!pick(w)) { out.push(w); continue; }
    const ax = w.a0[0], az = w.a0[2], bx = w.b0[0], bz = w.b0[2];
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    if (x1 < f.bbox[0] || x0 > f.bbox[2] || z1 < f.bbox[1] || z0 > f.bbox[3]) { out.push(w); continue; }
    const ts = [0, 1];
    for (const r of f.rings) for (let i = 0; i + 1 < r.length; i++) {
      const t = segCross(ax, az, bx, bz, r[i]![0], r[i]![1], r[i + 1]![0], r[i + 1]![1]);
      if (t >= 0) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k]!, t1 = ts[k + 1]!;
      if (t1 - t0 < 1e-6) continue;
      const tm = (t0 + t1) / 2;
      if (inFootprint(ax + (bx - ax) * tm, az + (bz - az) * tm, f)) continue;
      out.push(subQuad(w, t0, t1));
    }
  }
  return out;
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function subQuad(w: WallQuad, t0: number, t1: number): WallQuad {
  if (t0 === 0 && t1 === 1) return w;
  return {
    ...w, a0: lerp3(w.a0, w.b0, t0), a1: lerp3(w.a1, w.b1, t0), b0: lerp3(w.a0, w.b0, t1), b1: lerp3(w.a1, w.b1, t1),
    sa: w.sa + (w.sb - w.sa) * t0, sb: w.sa + (w.sb - w.sa) * t1,
  };
}

// ------------------------------------------------------------------------------------------------ junctions
export interface Junction {
  branch: number; host: number; kind: 'split' | 'merge'; side: -1 | 1;   // side of the branch relative to the host
  hostS0: number; hostS1: number; branchS0: number; branchS1: number;    // clipping windows (path-local baked s)
  gore: { x: number; y: number; z: number; fx: number; fy: number; fz: number } | null;
}

function nearestOnPath(p: PathModel, x: number, z: number, s0: number, s1: number): { s: number; d2: number } {
  let best = { s: s0, d2: Infinity };
  for (let s = s0; s <= s1; s += 1) {
    const q = sampleAt(p, s);
    const d2 = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d2 < best.d2) best = { s, d2 };
  }
  return best;
}

/** Finds the split/merge windows of every branch (where its footprint overlaps the host's). */
export function findJunctions(m: TrackModel): Junction[] {
  const out: Junction[] = [];
  for (const b of m.paths) {
    if (b.kind !== 'branch' || !b.map) continue;
    const h = m.paths[b.map.host]!;
    for (const kind of ['split', 'merge'] as const) {
      const hs = kind === 'split' ? b.hostFrom : b.hostTo;
      const dir = kind === 'split' ? 1 : -1;
      const sStart = kind === 'split' ? 0 : b.length;
      let sepAt = -1, run = 0, side: -1 | 1 = 1;
      for (let k = 0; k <= Math.min(180, b.length); k += 1) {
        const sb = sStart + dir * k;
        const q = sampleAt(b, sb);
        const near = nearestOnPath(h, q.x, q.z, hs - 200, hs + 200);
        const hq = sampleAt(h, near.s);
        const clear = hq.w / 2 + Math.max(hq.shL, hq.shR) + q.w / 2 + Math.max(q.shL, q.shR) + 1.5;
        const lat = (q.x - hq.x) * hq.rx + (q.z - hq.z) * hq.rz;
        if (k > 2 && Math.abs(lat) > 0.5) side = lat < 0 ? -1 : 1;
        if (Math.sqrt(near.d2) > clear) { run++; if (run >= 3) { sepAt = sb - dir * 2; break; } } else run = 0;
      }
      if (sepAt < 0) sepAt = sStart + dir * Math.min(180, b.length);
      const bq = sampleAt(b, sepAt);
      const hNear = nearestOnPath(h, bq.x, bq.z, hs - 200, hs + 200).s;
      const branchS0 = kind === 'split' ? 0 : Math.max(0, sepAt - 4), branchS1 = kind === 'split' ? Math.min(b.length, sepAt + 4) : b.length;
      const hostS0 = kind === 'split' ? hs - 8 : Math.min(hs, hNear) - 8, hostS1 = kind === 'split' ? Math.max(hs, hNear) + 8 : hs + 8;
      out.push({ branch: b.index, host: h.index, kind, side, hostS0, hostS1, branchS0, branchS1, gore: null });
    }
  }
  return out;
}

const sAlong = (soup: TriSoup, t: number): [number, number] => {
  const o = t * 3 * VS;
  const a = soup.v[o + 6]!, b = soup.v[o + VS + 6]!, c = soup.v[o + 2 * VS + 6]!;
  return [Math.min(a, b, c), Math.max(a, b, c)];
};
function inWindow(p: PathModel, s0: number, s1: number, lo: number, hi: number): boolean {
  if (!p.closed) return s1 >= lo && s0 <= hi;
  const L = p.length;
  for (const off of [-L, 0, L]) if (s1 + off >= lo && s0 + off <= hi) return true;
  return false;
}

/** Applies the junction clipping rules and adds gore cushions. */
export function clipJunctions(m: TrackModel, js: Junction[], ground: TriSoup, walls: WallQuad[], kerbs: TriSoup): { walls: WallQuad[]; touched: number } {
  let touched = 0;
  let W = walls;
  for (const j of js) {
    const h = m.paths[j.host]!, b = m.paths[j.branch]!;
    const hostRoad = footprint([pathRing(m, h, j.hostS0 - 5, j.hostS1 + 5, 'road')]);
    const hostFull = footprint([pathRing(m, h, j.hostS0 - 5, j.hostS1 + 5, 'full')]);
    const brFull = footprint([pathRing(m, b, Math.max(0, j.branchS0 - 2), Math.min(b.length, j.branchS1 + 2), 'full')]);
    const onB = (t: number, soup: TriSoup): boolean => { if (soup.path[t] !== b.index) return false; const [s0, s1] = sAlong(soup, t); return inWindow(b, s0, s1, j.branchS0, j.branchS1); };
    const onH = (t: number, soup: TriSoup): boolean => { if (soup.path[t] !== h.index) return false; const [s0, s1] = sAlong(soup, t); return inWindow(h, s0, s1, j.hostS0, j.hostS1); };
    // ground: the branch loses whatever lies on the host road; the host's shoulders lose whatever the branch covers
    touched += subtractFromSoup(ground, (t) => onB(t, ground), hostRoad);
    touched += subtractFromSoup(ground, (t) => onH(t, ground) && ground.role[t] === ROLE.SHOULDER, brFull);
    touched += subtractFromSoup(kerbs, (t) => onB(t, kerbs), hostRoad);
    touched += subtractFromSoup(kerbs, (t) => onH(t, kerbs), brFull);
    // walls: each loses the part inside the other's full footprint → a V-shaped gore where they part
    W = subtractFromWalls(W, (w) => w.path === h.index && inWindow(h, Math.min(w.sa, w.sb), Math.max(w.sa, w.sb), j.hostS0, j.hostS1), brFull);
    W = subtractFromWalls(W, (w) => w.path === b.index && inWindow(b, Math.min(w.sa, w.sb), Math.max(w.sa, w.sb), j.branchS0, j.branchS1), hostFull);
    // gore tip: where the branch's facing edge leaves (split) / enters (merge) the host footprint
    const facing = -j.side as -1 | 1;
    const steps = Math.ceil(j.branchS1 - j.branchS0) * 4;
    let prevIn = true;
    for (let k = 0; k <= steps; k++) {
      const s = j.kind === 'split' ? j.branchS0 + k / 4 : j.branchS1 - k / 4;
      const q = sampleAt(b, s);
      const d = facing * (q.w / 2 + (facing < 0 ? q.shL : q.shR));
      const x = q.x + q.rx * d, z = q.z + q.rz * d;
      const inside = inFootprint(x, z, hostFull);
      if (prevIn && !inside && k > 0) {
        const sg = j.kind === 'split' ? 1 : -1;
        j.gore = { x, y: q.y + q.ry * d, z, fx: q.tx * sg, fy: q.ty * sg, fz: q.tz * sg };
        break;
      }
      prevIn = inside;
    }
    if (j.gore && j.kind === 'split' && b.gore) W.push(...goreCushion(j, b.index, b.gore.h, b.gore.soft));
  }
  return { walls: W, touched };
}

/** A soft, rounded crash cushion at the gore tip (8-sided cylinder, r 0.6 m), 0.7 m into the wedge. */
function goreCushion(j: Junction, path: number, h: number, soft: boolean): WallQuad[] {
  const g = j.gore!;
  const cx = g.x + g.fx * 0.7, cz = g.z + g.fz * 0.7, y = g.y;
  const r = 0.6, n = 8, out: WallQuad[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0: [number, number, number] = [cx + Math.cos(a0) * r, y - 0.6, cz + Math.sin(a0) * r], p1: [number, number, number] = [cx + Math.cos(a1) * r, y - 0.6, cz + Math.sin(a1) * r];
    const am = (a0 + a1) / 2;
    out.push({ path, side: 1, flg: soft ? TFLAG.SOFT : 0, kind: 'gore', a0: p0, a1: [p0[0], y + Math.max(0.8, h), p0[2]], b0: p1, b1: [p1[0], y + Math.max(0.8, h), p1[2]], sa: 0, sb: 0, out: [Math.cos(am), 0, Math.sin(am)], render: true });
  }
  return out;
}
