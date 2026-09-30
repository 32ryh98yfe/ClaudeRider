// Turtle path → exact line/arc primitives (with CLOSE solver) → 1 m samples with smoothed attributes and frames.
// Coordinates: three.js world, x east, y up, north = −z. Heading ψ in degrees CCW from +x: dir = (cos ψ, 0, −sin ψ).
import { SURFACE_IDS, type SurfaceId } from '@cr/content';
import type { Attrs, SegCmd, TrackAst } from './dsl.ts';
import { TrackDslError } from './dsl.ts';

const DEG = Math.PI / 180;

export interface WallDef { type: 'none' | 'curb' | 'barrier' | 'fence' | 'rock' | 'parapet' | 'building' | 'invisible' | 'planter'; h: number }
export interface SegAttr { w: number; bank: number; surf: SurfaceId; wallL: WallDef; wallR: WallDef; shoulder: number; shoulderSurf: SurfaceId; noItem: boolean; dy: number }

export interface Prim { x: number; z: number; psi: number; len: number; curv: number; attr: SegAttr; seg: number; s0: number }

export interface Sample {
  s: number; x: number; y: number; z: number;
  tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; ux: number; uy: number; uz: number;
  w: number; bank: number; surf: number; shoulder: number; shoulderSurf: number; wallL: WallDef; wallR: WallDef; noItem: boolean;
  curv: number; // signed curvature in plan (+ = left), 1/m
}

export interface Geometry { prims: Prim[]; length: number; samples: Sample[]; closed: boolean; closure: { dx: number; dz: number; dy: number; dpsi: number }; solved: Record<string, number> }

function wallOf(spec: string | undefined, def: WallDef): WallDef {
  if (!spec) return def;
  const [t, h] = spec.split(':');
  return { type: (t as WallDef['type']) ?? def.type, h: h !== undefined ? Number(h) : (t === 'none' ? 0 : def.h) };
}
function surfOf(s: string | undefined, def: SurfaceId): SurfaceId {
  if (!s) return def;
  if (!(SURFACE_IDS as readonly string[]).includes(s)) throw new Error(`unknown surface ${s}`);
  return s as SurfaceId;
}

export function resolveAttrs(ast: TrackAst): SegAttr[] {
  const d = ast.defaults;
  let cur: SegAttr = {
    w: Number(d.w ?? 16), bank: 0, surf: surfOf(d.surf, 'asphalt'),
    wallL: wallOf(d.wallL ?? d.wall, { type: 'barrier', h: 1.0 }), wallR: wallOf(d.wallR ?? d.wall, { type: 'barrier', h: 1.0 }),
    shoulder: Number(d.shoulder ?? 0), shoulderSurf: surfOf(d.shoulderSurf, 'grass'), noItem: false, dy: 0,
  };
  const out: SegAttr[] = [];
  for (const s of ast.segs) {
    const a: Attrs = s.attrs;
    // persistent attributes (stay set until changed)
    const next: SegAttr = { ...cur };
    if (a.w) next.w = Number(a.w);
    if (a.surf) next.surf = surfOf(a.surf, cur.surf);
    if (a.wall) { next.wallL = wallOf(a.wall, cur.wallL); next.wallR = wallOf(a.wall, cur.wallR); }
    if (a.wallL) next.wallL = wallOf(a.wallL, cur.wallL);
    if (a.wallR) next.wallR = wallOf(a.wallR, cur.wallR);
    if (a.shoulder !== undefined) next.shoulder = Number(a.shoulder);
    if (a.shoulderSurf) next.shoulderSurf = surfOf(a.shoulderSurf, cur.shoulderSurf);
    // per-segment attributes (reset each segment)
    next.bank = a.bank !== undefined ? Number(a.bank) : 0;
    next.dy = a.dy !== undefined ? Number(a.dy) : 0;
    next.noItem = a.noitem === '1';
    out.push(next);
    cur = { ...next, bank: 0, dy: 0, noItem: false };
  }
  return out;
}

/** Runs the turtle, solving free straights (?a, ?b, ?c) for exact closure. */
export function buildGeometry(ast: TrackAst, ds = 1): Geometry {
  const attrs = resolveAttrs(ast);
  const segs = ast.segs;
  const closed = (ast.header.topo ?? 'circuit') === 'circuit';
  // pass 1: headings of every segment start (independent of straight lengths)
  const psi0: number[] = [];
  let psi = ast.start.hdg;
  for (const s of segs) {
    psi0.push(psi);
    if (s.kind === 'C') psi += (s.dir === 'L' ? 1 : -1) * s.deg!;
  }
  const endPsi = psi;
  const vars = new Map<string, number>();
  const lengthOf = (s: SegCmd): number => (s.kind === 'S' ? (typeof s.len === 'string' ? (vars.get(s.len) ?? 0) : s.len!) : s.r! * s.deg! * DEG);
  const endPos = (): { x: number; z: number; L: number } => {
    let x = ast.start.x, z = ast.start.z, L = 0;
    segs.forEach((s, i) => {
      const p = psi0[i]!;
      if (s.kind === 'S') { const l = lengthOf(s); x += Math.cos(p * DEG) * l; z -= Math.sin(p * DEG) * l; L += l; }
      else {
        const sg = s.dir === 'L' ? 1 : -1, r = s.r!, th = s.deg! * DEG;
        const nLx = -Math.sin(p * DEG), nLz = -Math.cos(p * DEG);
        const cx = x + sg * r * nLx, cz = z + sg * r * nLz;
        const p2 = p + sg * s.deg!;
        const nLx2 = -Math.sin(p2 * DEG), nLz2 = -Math.cos(p2 * DEG);
        x = cx - sg * r * nLx2; z = cz - sg * r * nLz2; L += r * th;
      }
    });
    return { x, z, L };
  };
  const solved: Record<string, number> = {};
  if (ast.close && ast.close.solve.length) {
    const names = ast.close.solve;
    for (const n of names) vars.set(n, 0);
    const base = endPos();
    // columns: direction of each free straight (+ length contribution)
    const cols = names.map((n) => {
      let dx = 0, dz = 0, dl = 0;
      segs.forEach((s, i) => { if (s.kind === 'S' && s.len === n) { dx += Math.cos(psi0[i]! * DEG); dz -= Math.sin(psi0[i]! * DEG); dl += 1; } });
      return [dx, dz, dl] as const;
    });
    const tx = closed ? ast.start.x - base.x : 0, tz = closed ? ast.start.z - base.z : 0, tl = ast.close.length - base.L;
    const rows: number[][] = names.length === 2 ? [[cols[0]![0], cols[1]![0], tx], [cols[0]![1], cols[1]![1], tz]]
      : names.length === 3 ? [[cols[0]![0], cols[1]![0], cols[2]![0], tx], [cols[0]![1], cols[1]![1], cols[2]![1], tz], [cols[0]![2], cols[1]![2], cols[2]![2], tl]]
        : [[cols[0]![2], tl]];
    const sol = solveLinear(rows);
    names.forEach((n, i) => { vars.set(n, sol[i]!); solved[n] = sol[i]!; });
    for (const n of names) if (!(vars.get(n)! > 0.5)) throw new TrackDslError({ file: ast.file, line: 1, col: 1, msg: `CLOSE produced non-positive straight ${n}=${vars.get(n)!.toFixed(2)}` });
  }

  // pass 2: primitives
  const prims: Prim[] = [];
  let x = ast.start.x, z = ast.start.z, s0 = 0;
  segs.forEach((s, i) => {
    const p = psi0[i]!;
    const len = lengthOf(s);
    const curv = s.kind === 'C' ? (s.dir === 'L' ? 1 : -1) / s.r! : 0;
    prims.push({ x, z, psi: p, len, curv, attr: attrs[i]!, seg: i, s0 });
    const e = primPoint(prims[prims.length - 1]!, len);
    x = e.x; z = e.z; s0 += len;
  });
  const L = s0;
  const closure = { dx: closed ? x - ast.start.x : 0, dz: closed ? z - ast.start.z : 0, dy: 0, dpsi: closed ? (((endPsi - ast.start.hdg) % 360) + 360) % 360 : 0 };
  if (closure.dpsi > 180) closure.dpsi -= 360;

  // pass 3: dense samples
  const n = Math.max(2, Math.round(L / ds));
  const step = L / n;
  const samples: Sample[] = [];
  const count = closed ? n + 1 : n + 1; // closed: last sample duplicates the first
  let pi = 0;
  // elevation: cumulative dy per segment, applied linearly over the segment length
  const yAtSegStart: number[] = [];
  let yAcc = ast.start.y;
  for (const pr of prims) { yAtSegStart.push(yAcc); yAcc += pr.attr.dy; }
  closure.dy = closed ? yAcc - ast.start.y : 0;
  for (let k = 0; k < count; k++) {
    const s = k === n ? L : k * step;
    while (pi < prims.length - 1 && s >= prims[pi]!.s0 + prims[pi]!.len) pi++;
    const pr = prims[pi]!;
    const local = Math.min(Math.max(s - pr.s0, 0), pr.len);
    const pt = primPoint(pr, local);
    const y = yAtSegStart[pi]! + pr.attr.dy * (pr.len > 0 ? local / pr.len : 0);
    const a = pr.attr;
    samples.push({
      s, x: pt.x, y, z: pt.z, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0,
      w: a.w, bank: a.bank, surf: SURFACE_IDS.indexOf(a.surf) + 1, shoulder: a.shoulder, shoulderSurf: SURFACE_IDS.indexOf(a.shoulderSurf) + 1,
      wallL: a.wallL, wallR: a.wallR, noItem: a.noItem, curv: pr.curv,
    });
  }
  if (closed) { const f = samples[0]!, l = samples[samples.length - 1]!; l.x = f.x; l.z = f.z; }
  const blend = Number(ast.defaults.blend ?? 15);
  smooth(samples, 'y', blend * 1.5, closed, step);
  smooth(samples, 'w', blend, closed, step);
  smooth(samples, 'bank', blend, closed, step);
  computeFrames(samples, closed);
  return { prims, length: L, samples, closed, closure, solved };
}

function primPoint(pr: Prim, l: number): { x: number; z: number; psi: number } {
  if (pr.curv === 0) {
    return { x: pr.x + Math.cos(pr.psi * DEG) * l, z: pr.z - Math.sin(pr.psi * DEG) * l, psi: pr.psi };
  }
  const sg = pr.curv > 0 ? 1 : -1, r = 1 / Math.abs(pr.curv);
  const nLx = -Math.sin(pr.psi * DEG), nLz = -Math.cos(pr.psi * DEG);
  const cx = pr.x + sg * r * nLx, cz = pr.z + sg * r * nLz;
  const p2 = pr.psi + (sg * l / r) / DEG;
  return { x: cx - sg * r * -Math.sin(p2 * DEG), z: cz - sg * r * -Math.cos(p2 * DEG), psi: p2 };
}

function solveLinear(rows: number[][]): number[] {
  const n = rows.length;
  const m = rows.map((r) => [...r]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    const d = m[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('CLOSE: singular system (free straights are parallel)');
    for (let k = c; k <= n; k++) m[c]![k]! /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = m[r]![c]!; for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!; }
  }
  return m.map((r) => r[n]!);
}

function smooth(S: Sample[], key: 'y' | 'w' | 'bank', window: number, closed: boolean, step: number): void {
  const half = Math.max(1, Math.round(window / 2 / step));
  const n = closed ? S.length - 1 : S.length;
  const src = S.slice(0, n).map((s) => s[key]);
  for (let i = 0; i < n; i++) {
    let acc = 0, wsum = 0;
    for (let k = -half; k <= half; k++) {
      let j = i + k;
      if (closed) j = ((j % n) + n) % n; else if (j < 0 || j >= n) continue;
      const wt = half + 1 - Math.abs(k); // triangular kernel
      acc += src[j]! * wt; wsum += wt;
    }
    S[i]![key] = acc / wsum;
  }
  if (closed) S[S.length - 1]![key] = S[0]![key];
}

/** worldUp frames (R = T × Y, U = R × T) + bank applied last. */
export function computeFrames(S: Sample[], closed: boolean): void {
  const n = S.length;
  const idx = (i: number): number => (closed ? ((i % (n - 1)) + (n - 1)) % (n - 1) : Math.max(0, Math.min(n - 1, i)));
  for (let i = 0; i < n; i++) {
    const a = S[idx(i - 1)]!, b = S[idx(i + 1)]!;
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // R = T × Y
    let rx = -tz, ry = 0, rz = tx;
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    // U = R × T
    let ux = ry * tz - rz * ty, uy = rz * tx - rx * tz, uz = rx * ty - ry * tx;
    const b0 = S[i]!.bank * DEG, c = Math.cos(b0), s = Math.sin(b0);
    const rx2 = rx * c + ux * s, ry2 = ry * c + uy * s, rz2 = rz * c + uz * s;
    const ux2 = ux * c - rx * s, uy2 = uy * c - ry * s, uz2 = uz * c - rz * s;
    rx = rx2; ry = ry2; rz = rz2; ux = ux2; uy = uy2; uz = uz2;
    const smp = S[i]!;
    smp.tx = tx; smp.ty = ty; smp.tz = tz; smp.rx = rx; smp.ry = ry; smp.rz = rz; smp.ux = ux; smp.uy = uy; smp.uz = uz;
  }
}
