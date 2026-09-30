// Ribbon mesher: adaptive rows along each path, profile-aware cross-sections, zipper triangulation between rows with
// different vertex sets (width changes, profile blends, pad/zone lateral boundaries), and walls as clippable quads.
// Ground vs wall is decided here, semantically (docs/design/11-track-spec.md §5.1): profile slopes up to 60° are ground.
import { TFLAG } from '@cr/sim';
import { SURF, exactAt, sampleAt, type PathModel, type Sample, type TrackModel } from './paths.ts';
import { inS, profileHeight, surfAt, type Content } from './content.ts';
import { PROFILE_VERTS } from './profiles.ts';
import { TriSoup, VS, type WallQuad } from './soup.ts';
import type { WallDef } from './turtle.ts';

export const ROLE = { ROAD: 0, SHOULDER: 1, SLOPE: 2, AREA: 3, KILL: 4, KERB: 5, CLIFF: 6, LANDING: 7, GORE: 8, OBSTACLE: 9 } as const;

const SOLID = (w: WallDef): boolean => w.type !== 'none' && w.type !== 'curb';
const LAVA = SURF('lava');

export interface MeshOptions { tol: number; maxStep: number; colSpacing: number }
export const DEFAULT_MESH: MeshOptions = { tol: 0.02, maxStep: 6, colSpacing: 2.5 };

interface XV { key: string; d: number; h: number; x: number; y: number; z: number; nx: number; ny: number; nz: number; s: number }

// ------------------------------------------------------------------------------------------------ rows
/** Forced row positions: primitive boundaries, jump parts, pads, zones, surface sub-ranges. */
function forcedRows(m: TrackModel, c: Content, p: PathModel): number[] {
  const out: number[] = [0, p.length];
  const toPath = (dsl: number): number => (p.index === 0 ? m.toMain(dsl) : dsl);
  for (const pr of p.prims) {
    out.push(toPath(pr.s0));
    for (const sub of pr.attr.surfSub) { out.push(toPath(pr.s0 + sub.from), toPath(pr.s0 + sub.from + sub.len)); }
  }
  for (const j of c.jumps) if (j.path === p.index && !j.legacy) out.push(j.s0, j.lipS, j.landS0, j.landS1);
  for (const pd of c.pads) if (pd.path === p.index) out.push(pd.s0, pd.s1);
  for (const z of c.zones) if (z.path === p.index && (z.surf !== undefined || !z.full)) out.push(z.s0, z.s1);
  const L = p.length;
  const norm = out.map((s) => (p.closed ? ((s % L) + L) % L : Math.max(0, Math.min(L, s))));
  if (p.closed) norm.push(L);
  return [...new Set(norm.map((s) => Math.round(s * 1e6) / 1e6))].sort((a, b) => a - b);
}

function edgeProbe(m: TrackModel, smp: Sample): [number, number, number][] {
  const W = smp.w / 2;
  const ds = [-(W + smp.shL), -W, 0, W, W + smp.shR];
  return ds.map((d) => { const h = profileHeight(m.profiles.get(smp.prof), smp, d); return [smp.x + smp.rx * d + smp.ux * h, smp.y + smp.ry * d + smp.uy * h, smp.z + smp.rz * d + smp.uz * h]; });
}

/** Greedy adaptive row selection: longest steps (≤ maxStep) whose chord error stays under tol, never skipping a forced row. */
export function ribbonRows(m: TrackModel, c: Content, p: PathModel, o: MeshOptions): number[] {
  const forced = forcedRows(m, c, p);
  const fset = new Set(forced);
  const cand = [...new Set([...p.samples.map((s) => Math.round(s.s * 1e6) / 1e6), ...forced])].sort((a, b) => a - b);
  const probes = cand.map((s) => edgeProbe(m, sampleAt(p, s)));
  const rows: number[] = [cand[0]!];
  let i = 0;
  while (i < cand.length - 1) {
    let best = i + 1;
    for (let j = i + 2; j < cand.length; j++) {
      if (cand[j]! - cand[i]! > o.maxStep) break;
      if (fset.has(cand[j - 1]!)) break;
      let ok = true;
      for (let k = i + 1; k < j && ok; k++) {
        const t = (cand[k]! - cand[i]!) / (cand[j]! - cand[i]!);
        for (let e = 0; e < 5; e++) {
          const A = probes[i]![e]!, B = probes[j]![e]!, P = probes[k]![e]!;
          const dx = A[0] + (B[0] - A[0]) * t - P[0], dy = A[1] + (B[1] - A[1]) * t - P[1], dz = A[2] + (B[2] - A[2]) * t - P[2];
          if (dx * dx + dy * dy + dz * dz > o.tol * o.tol) { ok = false; break; }
        }
      }
      if (!ok) break;
      best = j;
    }
    rows.push(cand[best]!);
    i = best;
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------ cross-sections
function pushXV(out: XV[], smp: Sample, key: string, d: number, h: number, slope: number): void {
  let nx = smp.ux - smp.rx * slope, ny = smp.uy - smp.ry * slope, nz = smp.uz - smp.rz * slope;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  out.push({ key, d, h, x: smp.x + smp.rx * d + smp.ux * h, y: smp.y + smp.ry * d + smp.uy * h, z: smp.z + smp.rz * d + smp.uz * h, nx, ny, nz, s: smp.s });
}

/** Cross-section vertices left → right: [shoulder L] road (profile or columns) [shoulder R]; keys mark anchors. */
export function crossSection(m: TrackModel, c: Content, p: PathModel, smp: Sample, o: MeshOptions): XV[] {
  const W = smp.w / 2;
  const prof = m.profiles.get(smp.prof);
  const pts: { key: string; d: number }[] = [];
  const profiled = !!prof && prof.kind !== 'flat' && smp.profT > 1e-4;
  if (smp.shL > 0.05) pts.push({ key: 'shL', d: -(W + smp.shL) });
  if (profiled) {
    const f = prof!.width > 0 ? smp.w / prof!.width : 1;
    for (let i = 0; i < PROFILE_VERTS; i++) pts.push({ key: i === 0 ? 'eL' : i === PROFILE_VERTS - 1 ? 'eR' : `p${i}`, d: prof!.pts[i]!.d * f });
  } else {
    const nc = Math.max(1, Math.ceil(smp.w / o.colSpacing));
    pts.push({ key: 'eL', d: -W });
    for (let k = 1; k < nc; k++) pts.push({ key: `c${k}/${nc}`, d: -W + (k * smp.w) / nc });
    pts.push({ key: 'eR', d: W });
  }
  if (smp.shR > 0.05) pts.push({ key: 'shR', d: W + smp.shR });
  // lateral surface boundaries (pads, partial-width zones) active at this s
  const extra: { key: string; d: number }[] = [];
  c.pads.forEach((pd, i) => { if (pd.path === p.index && inS(m, p.index, smp.s, pd.s0 - 1e-3, pd.s1 + 1e-3)) extra.push({ key: `pad${i}a`, d: pd.d0 }, { key: `pad${i}b`, d: pd.d1 }); });
  c.zones.forEach((z) => { if (z.path === p.index && !z.full && (z.surf !== undefined || z.kind === 'kill') && inS(m, p.index, smp.s, z.s0 - 1e-3, z.s1 + 1e-3)) extra.push({ key: `z${z.id}a`, d: z.d0 }, { key: `z${z.id}b`, d: z.d1 }); });
  const lo = pts[0]!.d, hi = pts[pts.length - 1]!.d;
  for (const e of extra) {
    if (e.d <= lo + 1e-3 || e.d >= hi - 1e-3) continue;
    if (pts.some((q) => Math.abs(q.d - e.d) < 1e-3)) { const q = pts.find((r) => Math.abs(r.d - e.d) < 1e-3)!; if (q.key.startsWith('c')) q.key = e.key; continue; }
    pts.push(e);
  }
  pts.sort((a, b) => a.d - b.d);
  const H = pts.map((q) => profileHeight(prof, smp, q.d));
  const out: XV[] = [];
  for (let i = 0; i < pts.length; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(pts.length - 1, i + 1);
    const slope = i1 > i0 ? (H[i1]! - H[i0]!) / (pts[i1]!.d - pts[i0]!.d) : 0;
    pushXV(out, smp, pts[i]!.key, pts[i]!.d, H[i]!, slope);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ zipper
function vtx(v: XV): number[] { return [v.x, v.y, v.z, v.nx, v.ny, v.nz, v.s, v.d]; }

/** Triangulates the strip between rows A (behind) and B (ahead); CCW seen from +U (front face up). */
function zip(A: XV[], B: XV[], emit: (a: XV, b: XV, c: XV) => void): void {
  const bIdx = new Map<string, number>();
  B.forEach((v, i) => bIdx.set(v.key, i));
  const anchors: [number, number][] = [[0, 0]];
  let lastB = 0;
  for (let i = 1; i < A.length - 1; i++) {
    const j = bIdx.get(A[i]!.key);
    if (j !== undefined && j > lastB && j < B.length - 1 && !A[i]!.key.startsWith('c')) { anchors.push([i, j]); lastB = j; }
  }
  anchors.push([A.length - 1, B.length - 1]);
  for (let k = 0; k + 1 < anchors.length; k++) {
    const [a0, b0] = anchors[k]!, [a1, b1] = anchors[k + 1]!;
    const da = A[a1]!.d - A[a0]!.d || 1, db = B[b1]!.d - B[b0]!.d || 1;
    let p = a0, q = b0;
    while (p < a1 || q < b1) {
      const tp = p < a1 ? (A[p + 1]!.d - A[a0]!.d) / da : Infinity;
      const tq = q < b1 ? (B[q + 1]!.d - B[b0]!.d) / db : Infinity;
      if (tp <= tq) { emit(A[p]!, A[p + 1]!, B[q]!); p++; }
      else { emit(A[p]!, B[q + 1]!, B[q]!); q++; }
    }
  }
}

// ------------------------------------------------------------------------------------------------ ribbons
export interface RibbonOut { rows: number[]; sections: XV[][]; kerbRows: number }

export function buildRibbon(m: TrackModel, c: Content, p: PathModel, ground: TriSoup, walls: WallQuad[], kerbs: TriSoup, o: MeshOptions): RibbonOut {
  const rows = ribbonRows(m, c, p, o);
  if (p.kind === 'rail') return { rows, sections: [], kerbRows: 0 };
  const smps = rows.map((s) => sampleAt(p, s));
  const secs = smps.map((smp) => crossSection(m, c, p, smp, o));
  // closed paths: the closing row must be bit-identical to the first row (no crack at s = 0); keep s = L for uv
  if (p.closed && secs.length > 1) secs[secs.length - 1] = secs[0]!.map((v) => ({ ...v, s: rows[rows.length - 1]! }));
  let kerbRows = 0;
  for (let r = 0; r + 1 < rows.length; r++) {
    const sa = rows[r]!, sb = rows[r + 1]!;
    if (sb - sa < 1e-6) continue;
    const mid = exactAt(m, p, (sa + sb) / 2);
    if (mid.jumpPart === 2 || mid.warp) continue; // jump gap / warp span: no ground, no walls
    const A = secs[r]!, B = secs[r + 1]!;
    // ground
    zip(A, B, (a, b, cc) => {
      const dc = (a.d + b.d + cc.d) / 3;
      const surf = surfAt(m, c, p.index, mid, dc);
      let flg = 0;
      if (surf === LAVA) flg |= TFLAG.KILL;
      for (const z of c.zones) if (z.kind === 'kill' && z.belowY === undefined && z.path === p.index && inS(m, p.index, mid.s, z.s0, z.s1) && dc >= z.d0 && dc <= z.d1) flg |= TFLAG.KILL;
      const W = mid.w / 2;
      const nUp = (a.nx + b.nx + cc.nx) * mid.ux + (a.ny + b.ny + cc.ny) * mid.uy + (a.nz + b.nz + cc.nz) * mid.uz;
      const role = dc < -W - 1e-3 || dc > W + 1e-3 ? ROLE.SHOULDER : nUp < 3 * 0.97 ? ROLE.SLOPE : mid.jumpPart === 3 ? ROLE.LANDING : ROLE.ROAD;
      ground.push(vtx(a), vtx(b), vtx(cc), surf, role === ROLE.SLOPE ? flg | TFLAG.SLOPE : flg, p.index, role);
    });
    // walls (outermost ground vertex of each row, per side)
    for (const side of [-1, 1] as const) {
      const wd = side < 0 ? mid.wallL : mid.wallR;
      if (!SOLID(wd)) continue;
      const ea = side < 0 ? A[0]! : A[A.length - 1]!, eb = side < 0 ? B[0]! : B[B.length - 1]!;
      const sA = smps[r]!, sB = smps[r + 1]!;
      const hTop = Math.max(0.6, wd.h);
      const up = (smp: Sample, v: XV, h: number): [number, number, number] => [v.x + smp.ux * h, v.y + smp.uy * h, v.z + smp.uz * h];
      let flg = 0;
      if (wd.soft) flg |= TFLAG.SOFT;
      if (wd.type === 'invisible') flg |= TFLAG.INVISIBLE;
      walls.push({
        path: p.index, side, flg, kind: wd.type,
        a0: up(sA, ea, -0.6), a1: up(sA, ea, hTop), b0: up(sB, eb, -0.6), b1: up(sB, eb, hTop), sa, sb,
        out: [side * mid.rx, side * mid.ry, side * mid.rz], render: wd.type !== 'invisible',
      });
    }
    // kerbs: on corners (|κ| > 1/70) and wherever a curb wall is declared; flat profiles only
    const profiled = mid.profT > 1e-3 && m.profiles.get(mid.prof)?.kind !== 'flat';
    if (!profiled) {
      const corner = Math.abs(mid.curv) > 1 / 70;
      for (const side of [-1, 1] as const) {
        const wd = side < 0 ? mid.wallL : mid.wallR;
        if (!corner && wd.type !== 'curb') continue;
        const sA = smps[r]!, sB = smps[r + 1]!;
        const e0 = side * sA.w / 2, e1 = side * sB.w / 2;
        const i0 = e0 - side * 1.1, i1 = e1 - side * 1.1;
        const P = (smp: Sample, d: number): number[] => {
          const h = profileHeight(m.profiles.get(smp.prof), smp, d) + 0.03;
          return [smp.x + smp.rx * d + smp.ux * h, smp.y + smp.ry * d + smp.uy * h, smp.z + smp.rz * d + smp.uz * h, smp.ux, smp.uy, smp.uz, smp.s, d];
        };
        const a0 = P(sA, side < 0 ? e0 : i0), a1 = P(sA, side < 0 ? i0 : e0), b0 = P(sB, side < 0 ? e1 : i1), b1 = P(sB, side < 0 ? i1 : e1);
        kerbs.push(a0, a1, b0, 0, 0, p.index, ROLE.KERB);
        kerbs.push(a1, b1, b0, 0, 0, p.index, ROLE.KERB);
        kerbRows++;
      }
    }
  }
  return { rows, sections: secs, kerbRows };
}

/** Wall quads → triangles (both faces are collidable; the sim resolves by closest point). */
export function wallTriangles(walls: WallQuad[], out: TriSoup): void {
  for (const w of walls) {
    const n = [-w.out[0], -w.out[1], -w.out[2]];
    const V = (p: [number, number, number], s: number, h: number): number[] => [p[0], p[1], p[2], n[0]!, n[1]!, n[2]!, s, h];
    out.push(V(w.a0, w.sa, 0), V(w.b0, w.sb, 0), V(w.a1, w.sa, 1), 0, w.flg, w.path, ROLE.CLIFF);
    out.push(V(w.a1, w.sa, 1), V(w.b0, w.sb, 0), V(w.b1, w.sb, 1), 0, w.flg, w.path, ROLE.CLIFF);
  }
}

export { VS, SOLID };
