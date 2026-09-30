// Test-side .ctrk builder. Physics fixtures (flat plane, corridors, corner kits, halfpipes, loops, stacked decks,
// rails, warps, jumps) are described analytically here, swept into collision meshes and written through the real
// binary container, so the sim under test reads them exactly like a baked track. Test code may use trig freely.
import {
  AIS, CTRK_MAGIC, CTRK_VERSION, SFLAG, SMP, buildTriHash, loadCtrk, toArrayBuffer, writeContainer,
  type BakedTrack, type CtrkMeta, type CtrkPathMeta, type JumpBaked, type PadBaked, type PoseBaked, type RailBaked,
  type TypedArray, type WarpBaked, type ZoneBaked,
} from '@cr/sim';
import { SURFACE_IDS, type SurfaceId, type TrackId } from '@cr/content';

export interface V3 { x: number; y: number; z: number }
export interface Frame { x: number; y: number; z: number; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; ux: number; uy: number; uz: number }
export interface PathSample extends Frame { s: number; wL: number; wR: number; flags: number; sMain: number }

export const surf = (id: SurfaceId): number => SURFACE_IDS.indexOf(id) + 1;

// ------------------------------------------------------------------------------------------------ vector helpers
const norm = (x: number, y: number, z: number): V3 => { const l = Math.hypot(x, y, z) || 1; return { x: x / l, y: y / l, z: z / l }; };
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });

/** Frame from a tangent with worldUp construction (R = T × Y, U = R × T), then bank (deg, + raises the right edge). */
export function worldUpFrame(p: V3, t: V3, bankDeg = 0): Frame {
  const T = norm(t.x, t.y, t.z);
  let R = norm(-T.z, 0, T.x);
  let U = cross(R, T);
  if (bankDeg !== 0) {
    const b = (bankDeg * Math.PI) / 180, c = Math.cos(b), s = Math.sin(b);
    const R2 = { x: R.x * c + U.x * s, y: R.y * c + U.y * s, z: R.z * c + U.z * s };
    const U2 = { x: U.x * c - R.x * s, y: U.y * c - R.y * s, z: U.z * c - R.z * s };
    R = R2; U = U2;
  }
  return { x: p.x, y: p.y, z: p.z, tx: T.x, ty: T.y, tz: T.z, rx: R.x, ry: R.y, rz: R.z, ux: U.x, uy: U.y, uz: U.z };
}

// ------------------------------------------------------------------------------------------------ centrelines
export type Seg = { len: number } | { r: number; deg: number; dir: 'L' | 'R' };

/**
 * Planar turtle path (heading ψ in degrees CCW from +x; north = −z, as in trackc) sampled every `ds` metres.
 * `y(s)` and `bank(s)` add elevation and bank; frames are worldUp.
 */
export function turtle(segs: readonly Seg[], o: { x?: number; z?: number; hdg?: number; ds?: number; y?: (s: number) => number; slope?: (s: number) => number; bank?: (s: number) => number } = {}): Frame[] {
  const ds = o.ds ?? 1;
  const yOf = o.y ?? ((): number => 0);
  const bankOf = o.bank ?? ((): number => 0);
  // exact primitives
  const prims: { x: number; z: number; psi: number; len: number; curv: number; s0: number }[] = [];
  let x = o.x ?? 0, z = o.z ?? 0, psi = o.hdg ?? 0, s0 = 0;
  for (const g of segs) {
    if ('len' in g) {
      prims.push({ x, z, psi, len: g.len, curv: 0, s0 });
      x += Math.cos((psi * Math.PI) / 180) * g.len; z -= Math.sin((psi * Math.PI) / 180) * g.len; s0 += g.len;
    } else {
      const len = (g.r * g.deg * Math.PI) / 180, sg = g.dir === 'L' ? 1 : -1;
      prims.push({ x, z, psi, len, curv: sg / g.r, s0 });
      const e = primPoint(prims[prims.length - 1]!, len);
      x = e.x; z = e.z; psi = e.psi; s0 += len;
    }
  }
  const L = s0, n = Math.max(1, Math.round(L / ds)), step = L / n;
  const out: Frame[] = [];
  let pi = 0;
  for (let k = 0; k <= n; k++) {
    const s = k === n ? L : k * step;
    while (pi < prims.length - 1 && s >= prims[pi]!.s0 + prims[pi]!.len) pi++;
    const pr = prims[pi]!;
    const pt = primPoint(pr, Math.min(Math.max(s - pr.s0, 0), pr.len));
    const h = (pt.psi * Math.PI) / 180;
    // an explicit slope keeps one-sided tangents at kinks (a jump lip must carry the ramp's normal)
    const dy = o.slope ? o.slope(s) : (yOf(s + 0.01) - yOf(s - 0.01)) / 0.02;
    out.push(worldUpFrame({ x: pt.x, y: yOf(s), z: pt.z }, { x: Math.cos(h), y: dy, z: -Math.sin(h) }, bankOf(s)));
  }
  return out;
}

function primPoint(pr: { x: number; z: number; psi: number; curv: number }, l: number): { x: number; z: number; psi: number } {
  const D = Math.PI / 180;
  if (pr.curv === 0) return { x: pr.x + Math.cos(pr.psi * D) * l, z: pr.z - Math.sin(pr.psi * D) * l, psi: pr.psi };
  const sg = pr.curv > 0 ? 1 : -1, r = 1 / Math.abs(pr.curv);
  const nLx = -Math.sin(pr.psi * D), nLz = -Math.cos(pr.psi * D);
  const cx = pr.x + sg * r * nLx, cz = pr.z + sg * r * nLz;
  const p2 = pr.psi + (sg * l) / r / D;
  return { x: cx + sg * r * Math.sin(p2 * D), z: cz + sg * r * Math.cos(p2 * D), psi: p2 };
}

/**
 * Rotation-minimizing frames along a polyline (double reflection, Wang et al. 2008); `up0` seeds the first frame.
 * With `span = [i0, i1]` the residual twist at i1 relative to the worldUp frame there is distributed over the span
 * as φ·smoothstep(arc fraction) (11-track-spec §4), and frames after i1 continue from the corrected one.
 */
export function rmfFrames(pts: readonly V3[], up0: V3 = { x: 0, y: 1, z: 0 }, span?: readonly [number, number]): Frame[] {
  const F = rmfRaw(pts, up0);
  if (!span) return F;
  const [i0, i1] = span;
  const e = F[i1]!, T = { x: e.tx, y: e.ty, z: e.tz };
  const Rw = norm(-T.z, 0, T.x);
  const r = { x: e.rx, y: e.ry, z: e.rz };
  const phi = Math.atan2(dot(cross(r, Rw), T), dot(r, Rw));
  const S = [0];
  for (let i = 1; i < F.length; i++) S.push(S[i - 1]! + Math.hypot(F[i]!.x - F[i - 1]!.x, F[i]!.y - F[i - 1]!.y, F[i]!.z - F[i - 1]!.z));
  for (let i = i0; i < F.length; i++) {
    const x = i >= i1 ? 1 : (S[i]! - S[i0]!) / (S[i1]! - S[i0]!);
    const a = phi * x * x * (3 - 2 * x);
    const f = F[i]!, t = { x: f.tx, y: f.ty, z: f.tz }, ri = { x: f.rx, y: f.ry, z: f.rz };
    const txr = cross(t, ri), c = Math.cos(a), s = Math.sin(a);
    const rr = norm(ri.x * c + txr.x * s, ri.y * c + txr.y * s, ri.z * c + txr.z * s);
    const u = cross(rr, t);
    f.rx = rr.x; f.ry = rr.y; f.rz = rr.z; f.ux = u.x; f.uy = u.y; f.uz = u.z;
  }
  return F;
}

function rmfRaw(pts: readonly V3[], up0: V3): Frame[] {
  const n = pts.length;
  const tan: V3[] = pts.map((_, i) => { const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!; const d = sub(b, a); return norm(d.x, d.y, d.z); });
  // right = t × up (so that up = right × t, matching worldUp frames)
  let r = cross(tan[0]!, up0); r = norm(r.x, r.y, r.z);
  const out: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const t = tan[i]!;
    const u = cross(r, t);
    out.push({ x: pts[i]!.x, y: pts[i]!.y, z: pts[i]!.z, tx: t.x, ty: t.y, tz: t.z, rx: r.x, ry: r.y, rz: r.z, ux: u.x, uy: u.y, uz: u.z });
    if (i === n - 1) break;
    const v1 = sub(pts[i + 1]!, pts[i]!), c1 = dot(v1, v1);
    const rL = sub(r, scale(v1, (2 / c1) * dot(v1, r)));
    const tL = sub(t, scale(v1, (2 / c1) * dot(v1, t)));
    const v2 = sub(tan[i + 1]!, tL), c2 = dot(v2, v2);
    const rN = c2 > 1e-18 ? sub(rL, scale(v2, (2 / c2) * dot(v2, rL))) : rL;
    // re-orthogonalize against the next tangent (numerical hygiene)
    const tn = tan[i + 1]!;
    const rr = sub(rN, scale(tn, dot(rN, tn)));
    r = norm(rr.x, rr.y, rr.z);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ meshes
export interface Mesh { pos: number[]; nrm: number[]; idx: number[]; surf: number[]; flg: number[] }
export const newMesh = (): Mesh => ({ pos: [], nrm: [], idx: [], surf: [], flg: [] });

/** A cross-section point: lateral offset u (+ right), height h (along up) and the section's local normal (nu, nh). */
export interface ProfilePt { u: number; h: number; nu: number; nh: number }

export const flatProfile = (uL: number, uR: number, cols = 8): ProfilePt[] =>
  Array.from({ length: cols + 1 }, (_, k) => ({ u: uL + ((uR - uL) * k) / cols, h: 0, nu: 0, nh: 1 }));

/**
 * Sweeps a cross-section along frames into ground triangles (front face up, i.e. (right, forward) winding).
 * `quad(i, c)` returns [surf, flags] for the quad starting at frame i, column c; `skip(i)` leaves a row gap (jumps).
 */
export function sweep(mesh: Mesh, F: readonly Frame[], profile: (i: number) => readonly ProfilePt[], o: { every?: number; quad?: (i: number, c: number) => [number, number]; skip?: (i: number) => boolean } = {}): void {
  const every = o.every ?? 2;
  const rows: number[] = [];
  for (let i = 0; i < F.length; i += every) rows.push(i);
  if (rows[rows.length - 1] !== F.length - 1) rows.push(F.length - 1);
  let prevBase = -1, prevRow = -1, prevCols = 0;
  for (const ri of rows) {
    const f = F[ri]!, prof = profile(ri);
    const base = mesh.pos.length / 3;
    for (const p of prof) {
      mesh.pos.push(f.x + f.rx * p.u + f.ux * p.h, f.y + f.ry * p.u + f.uy * p.h, f.z + f.rz * p.u + f.uz * p.h);
      const nx = f.rx * p.nu + f.ux * p.nh, ny = f.ry * p.nu + f.uy * p.nh, nz = f.rz * p.nu + f.uz * p.nh;
      const l = Math.hypot(nx, ny, nz) || 1;
      mesh.nrm.push(nx / l, ny / l, nz / l);
    }
    if (prevBase >= 0 && prevCols === prof.length && !(o.skip?.(prevRow) ?? false)) {
      for (let c = 0; c < prof.length - 1; c++) {
        const a = prevBase + c, b = prevBase + c + 1, cc = base + c, d = base + c + 1;
        mesh.idx.push(a, b, cc, b, d, cc);
        const [sf, fl] = o.quad?.(prevRow, c) ?? [surf('asphalt'), 0];
        mesh.surf.push(sf, sf); mesh.flg.push(fl, fl);
      }
    }
    prevBase = base; prevRow = ri; prevCols = prof.length;
  }
}

/** Vertical wall strip along frames at lateral offset `u(i)`, from `hLo` to `hHi` along up. */
export function wallStrip(mesh: Mesh, F: readonly Frame[], u: (i: number) => number, hLo = -0.6, hHi = 1.0, o: { every?: number; from?: number; to?: number } = {}): void {
  const every = o.every ?? 2, i0 = o.from ?? 0, i1 = o.to ?? F.length - 1;
  let prev = -1;
  for (let i = i0; i <= i1; i += every) {
    const f = F[i]!, uu = u(i);
    const base = mesh.pos.length / 3;
    mesh.pos.push(f.x + f.rx * uu + f.ux * hLo, f.y + f.ry * uu + f.uy * hLo, f.z + f.rz * uu + f.uz * hLo);
    mesh.pos.push(f.x + f.rx * uu + f.ux * hHi, f.y + f.ry * uu + f.uy * hHi, f.z + f.rz * uu + f.uz * hHi);
    mesh.nrm.push(-Math.sign(uu) * f.rx, -Math.sign(uu) * f.ry, -Math.sign(uu) * f.rz, -Math.sign(uu) * f.rx, -Math.sign(uu) * f.ry, -Math.sign(uu) * f.rz);
    if (prev >= 0) { mesh.idx.push(prev, base, prev + 1, prev + 1, base, base + 1); mesh.surf.push(0, 0); mesh.flg.push(0, 0); }
    prev = base;
    if (i < i1 && i + every > i1) i = i1 - every;
  }
}

// ------------------------------------------------------------------------------------------------ assembly
export interface FixturePath {
  kind: CtrkPathMeta['kind'];
  closed: boolean;
  frames: readonly Frame[];
  wL: number | ((i: number) => number);
  wR: number | ((i: number) => number);
  flags?: (i: number, s: number) => number;
  map?: CtrkPathMeta['map'];
  gravityScale?: number;
  aiMinSkill?: number;
  /** sMain of sample i (defaults: main = s − lineAt; others = affine map onto the host). */
  sMain?: (s: number) => number;
}

export interface FixtureSpec {
  id?: string;
  topology?: 'circuit' | 'p2p';
  lineAt?: number;                 // p2p: main-line s of the start line
  lapLength?: number;
  laps?: number;
  paths: FixturePath[];
  ground: Mesh;
  walls?: Mesh;
  grid?: PoseBaked[];              // default: 8 poses behind the line on the main path
  killY?: number;
  keyGates?: number[];
  zones?: ZoneBaked[];
  rails?: RailBaked[];
  warps?: WarpBaked[];
  jumps?: JumpBaked[];
  pads?: PadBaked[];
  refLapTicks?: number;
}

/** Arc length of every frame along the polyline (the path's `s` column). */
export function arcLen(F: readonly Frame[]): number[] {
  const s = [0];
  for (let i = 1; i < F.length; i++) s.push(s[i - 1]! + Math.hypot(F[i]!.x - F[i - 1]!.x, F[i]!.y - F[i - 1]!.y, F[i]!.z - F[i - 1]!.z));
  return s;
}

/** Signed plan curvature, 40 m turn-ahead, yaw-budget speed limit and width, like the trackc AI bake. */
function bakeAiTable(F: readonly Frame[], S: readonly number[], closed: boolean, width: (i: number) => number): Float64Array {
  const n = F.length, nSeg = closed ? n - 1 : n;
  const idx = (i: number): number => (closed ? ((i % nSeg) + nSeg) % nSeg : Math.max(0, Math.min(n - 1, i)));
  const step = S[n - 1]! / Math.max(1, n - 1);
  const per = (m: number): number => Math.max(1, Math.round(m / step));
  const heading = (f: Frame): number => Math.atan2(-f.tz, f.tx);
  const dAng = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const kappa = new Float64Array(n), w2 = per(2);
  for (let i = 0; i < n; i++) kappa[i] = dAng(heading(F[idx(i - w2)]!), heading(F[idx(i + w2)]!)) / (2 * w2 * step);
  const out = new Float64Array(n * AIS.STRIDE);
  const look40 = per(40), look90 = per(90), st2 = per(2);
  for (let i = 0; i < n; i++) {
    const o = i * AIS.STRIDE;
    out[o + AIS.KAPPA] = kappa[i]!;
    out[o + AIS.TURN40] = dAng(heading(F[i]!), heading(F[idx(i + look40)]!));
    out[o + AIS.WIDTH] = width(i) / 2;
    let turnSum = 0;
    for (let k = 0; k <= look90; k += st2) turnSum += Math.abs(kappa[idx(i + k)]!) * 2;
    const cap = turnSum > 2.2 ? 1.0 : 1.7;
    let vLim = 99;
    for (let k = 0; k <= look90; k += st2) {
      const cr = Math.abs(kappa[idx(i + k)]!);
      if (cr > 1e-4) { const va = cap * (1 / cr + 0.6 * width(idx(i + k)) / 2); const vr = Math.sqrt(va * va + 2 * 0.8 * 24 * k * step); if (vr < vLim) vLim = vr; }
    }
    out[o + AIS.VLIM] = vLim;
  }
  return out;
}

const fnv = (bytes: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};

export interface Fixture { track: BakedTrack; spec: FixtureSpec; S: number[][] }

/** Writes the fixture through the real .ctrk container and loads it back. */
export function buildFixture(spec: FixtureSpec): Fixture {
  const main = spec.paths[0]!;
  const topology = spec.topology ?? (main.closed ? 'circuit' : 'p2p');
  const lineAt = spec.lineAt ?? 0;
  const Ss = spec.paths.map((p) => arcLen(p.frames));
  const mainLen = Ss[0]![Ss[0]!.length - 1]!;
  const lapLength = spec.lapLength ?? (topology === 'circuit' ? mainLen : mainLen - lineAt - 20);
  const arrays: [string, TypedArray][] = [];
  const pathMeta: CtrkPathMeta[] = [];
  spec.paths.forEach((p, k) => {
    const F = p.frames, S = Ss[k]!, n = F.length, L = S[n - 1]!;
    const wL = typeof p.wL === 'number' ? ((): number => p.wL as number) : p.wL;
    const wR = typeof p.wR === 'number' ? ((): number => p.wR as number) : p.wR;
    const sMainOf = p.sMain ?? (k === 0
      ? (s: number): number => (topology === 'circuit' ? s : s - lineAt)
      : (s: number): number => (p.map ? p.map.fromS + ((p.map.toS - p.map.fromS) * s) / L : 0) - (topology === 'circuit' ? 0 : lineAt));
    const smp = new Float64Array(n * SMP.STRIDE), flg = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      const f = F[i]!, o = i * SMP.STRIDE;
      smp[o + SMP.PX] = f.x; smp[o + SMP.PY] = f.y; smp[o + SMP.PZ] = f.z;
      smp[o + SMP.TX] = f.tx; smp[o + SMP.TY] = f.ty; smp[o + SMP.TZ] = f.tz;
      smp[o + SMP.RX] = f.rx; smp[o + SMP.RY] = f.ry; smp[o + SMP.RZ] = f.rz;
      smp[o + SMP.UX] = f.ux; smp[o + SMP.UY] = f.uy; smp[o + SMP.UZ] = f.uz;
      smp[o + SMP.S] = S[i]!; smp[o + SMP.WL] = wL(i); smp[o + SMP.WR] = wR(i);
      smp[o + SMP.SMAIN] = sMainOf(S[i]!);
      flg[i] = (p.flags?.(i, S[i]!) ?? 0) | (surf('asphalt') & SFLAG.SURF_MASK);
    }
    arrays.push([`p${k}.smp`, smp], [`p${k}.flg`, flg], [`p${k}.ai`, bakeAiTable(F, S, p.closed, (i) => wL(i) + wR(i))]);
    pathMeta.push({
      id: k === 0 ? 'main' : `${p.kind}${k}`, kind: p.kind, closed: p.closed, length: L, n, ds: L / (n - 1), aiMinSkill: p.aiMinSkill ?? 0,
      ...(p.map ? { map: p.map } : {}), ...(p.gravityScale !== undefined ? { gravityScale: p.gravityScale } : {}),
    });
  });
  const g = spec.ground, wm = spec.walls && spec.walls.idx.length ? spec.walls : { pos: [0, -1e4, 0, 1, -1e4, 0, 0, -1e4, 1], idx: [0, 1, 2], flg: [0], nrm: [], surf: [0] };
  const gPos = Float64Array.from(g.pos), gIdx = Uint32Array.from(g.idx), wPos = Float64Array.from(wm.pos), wIdx = Uint32Array.from(wm.idx);
  const gh = buildTriHash(gPos, gIdx), wh = buildTriHash(wPos, wIdx);
  arrays.push(
    ['g.pos', gPos], ['g.nrm', Float64Array.from(g.nrm)], ['g.idx', gIdx], ['g.surf', Uint8Array.from(g.surf)], ['g.flg', Uint8Array.from(g.flg)],
    ['g.hd', Float64Array.from([gh.ox, gh.oy, gh.oz, gh.nx, gh.ny, gh.nz])], ['g.hk', gh.keys], ['g.hs', gh.starts], ['g.ht', gh.tris],
    ['w.pos', wPos], ['w.idx', wIdx], ['w.flg', Uint8Array.from(wm.flg)],
    ['w.hd', Float64Array.from([wh.ox, wh.oy, wh.oz, wh.nx, wh.ny, wh.nz])], ['w.hk', wh.keys], ['w.hs', wh.starts], ['w.ht', wh.tris],
  );
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < gPos.length; i += 3) {
    minX = Math.min(minX, gPos[i]!); maxX = Math.max(maxX, gPos[i]!); minY = Math.min(minY, gPos[i + 1]!); maxY = Math.max(maxY, gPos[i + 1]!); minZ = Math.min(minZ, gPos[i + 2]!); maxZ = Math.max(maxZ, gPos[i + 2]!);
  }
  const grid = spec.grid ?? defaultGrid(main.frames, Ss[0]!, topology === 'circuit' ? mainLen : lineAt, topology === 'circuit');
  const meta: CtrkMeta = {
    id: (spec.id ?? 'proving_ring') as TrackId, name: spec.id ?? 'fixture', themeId: 'spark_circuit', hash: '', difficulty: 1,
    lapLength, laps: spec.laps ?? 1, topology, killY: spec.killY ?? minY - 12, bounds: [minX, minY, minZ, maxX, maxY, maxZ],
    paths: pathMeta, grid, boxes: [], pads: spec.pads ?? [], zones: spec.zones ?? [], rails: spec.rails ?? [], warps: spec.warps ?? [],
    jumps: spec.jumps ?? [], hazards: [], keyGates: spec.keyGates ?? [], refLapTicks: spec.refLapTicks ?? 0, hashCells: { cs: gh.cs, cy: gh.cy },
  };
  meta.hash = fnv(writeContainer(CTRK_MAGIC, CTRK_VERSION, meta, arrays));
  const bytes = writeContainer(CTRK_MAGIC, CTRK_VERSION, meta, arrays);
  return { track: loadCtrk(toArrayBuffer(bytes)), spec, S: Ss };
}

/** 8 grid poses (2 columns, 7 m pitch) behind main-line s = `lineS`. */
function defaultGrid(F: readonly Frame[], S: readonly number[], lineS: number, closed: boolean): PoseBaked[] {
  const out: PoseBaked[] = [];
  for (let k = 0; k < 8; k++) {
    const back = 8 + Math.floor(k / 2) * 7 + (k % 2) * 3.5;
    let s = lineS - back;
    if (closed && s < 0) s += S[S.length - 1]!;
    let i = 0;
    while (i < S.length - 2 && S[i + 1]! <= s) i++;
    const f = F[Math.max(0, i)]!, u = k % 2 === 0 ? -4 : 4;
    out.push({ x: f.x + f.rx * u, y: f.y + f.ry * u, z: f.z + f.rz * u, fx: f.tx, fy: f.ty, fz: f.tz });
  }
  return out;
}
