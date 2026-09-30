// FROZEN interface (review-enforced, not hash-locked: lanes L1/L4 extend the implementation). Runtime view of a baked .ctrk track: collision queries + spline graph.
// All queries are deterministic (arithmetic + sqrt) and allocation-free.
// v2 (L4): f32 arrays are widened to f64 once at load; locate follows path links (branch split/merge, rail exits);
// per-sample gravity scales; respawn tables; analytic hazard motion (docs/design/contract-requests/L4-ctrk-v2.md).
import type { TrackId } from '@cr/content';
import type { Tick } from '../core/units.ts';
import type { TrackLoc } from '../core/state.ts';
import { detSinCos } from '../core/math.ts';
import { readContainer, type TypedArray } from './container.ts';
import { findCell, type TriHashData } from './trihash.ts';
import {
  AIS, CTRK_MAGIC, CTRK_VERSION, SFLAG, SMP,
  type CtrkMeta, type CtrkPathMeta, type HazardDefBaked, type PoseBaked, type BoxBaked, type PadBaked,
  type ZoneBaked, type RailBaked, type WarpBaked, type JumpBaked, type GravMode,
} from './format.ts';

export interface GroundHit { t: number; x: number; y: number; z: number; nx: number; ny: number; nz: number; surf: number; tri: number; flags: number }
export interface Contact { x: number; y: number; z: number; nx: number; ny: number; nz: number; depth: number; flags: number; tri: number }
export interface FrameSample { px: number; py: number; pz: number; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; ux: number; uy: number; uz: number; wL: number; wR: number; sMain: number; flags: number }
export interface AiSample { lineU: number; vLim: number; kappa: number; turnAhead40: number; driftZone: number; width: number }
export interface GravityOut { x: number; y: number; z: number; scale: number }
/** Hazard pose at a tick. v2 adds the shape's local frame (f = forward/long axis, u = up/cylinder axis) and phase ∈ [0,1). */
export interface HazardPose { x: number; y: number; z: number; active: 0 | 1; telegraph: 0 | 1; fx?: number; fy?: number; fz?: number; ux?: number; uy?: number; uz?: number; phase?: number }

export interface BakedTrack {
  readonly id: TrackId;
  readonly meta: Readonly<CtrkMeta>;
  readonly hash: string;
  readonly lapLength: number;
  readonly laps: number;
  readonly topology: 'circuit' | 'p2p';
  readonly nPaths: number;
  readonly grid: ReadonlyArray<PoseBaked>;
  readonly boxes: ReadonlyArray<BoxBaked>;
  readonly pads: ReadonlyArray<PadBaked>;
  readonly keyGates: ReadonlyArray<number>;
  readonly hazards: ReadonlyArray<HazardDefBaked>;
  readonly zones: ReadonlyArray<ZoneBaked>;
  readonly rails: ReadonlyArray<RailBaked>;
  readonly warps: ReadonlyArray<WarpBaked>;
  readonly jumps: ReadonlyArray<JumpBaked>;
  readonly killY: number;
  path(p: number): Readonly<CtrkPathMeta>;
  /** Nearest front-facing ground hit along the ray within [0, maxT]. */
  groundRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: GroundHit): boolean;
  /** Wall contacts of a sphere; returns number written to `out` (≤ max). */
  sphereWalls(cx: number, cy: number, cz: number, r: number, out: Contact[], max: number): number;
  /** Graph-local projection of a world point near the previous location. Returns false if no valid candidate. */
  locate(px: number, py: number, pz: number, prev: Readonly<TrackLoc>, out: TrackLoc): boolean;
  /** Global (slow) projection used after respawn/teleport or when locate fails. */
  locateGlobal(px: number, py: number, pz: number, out: TrackLoc): boolean;
  frameAt(path: number, s: number, out: FrameSample): void;
  gravityAt(loc: Readonly<TrackLoc>, out: GravityOut): void;
  aiAt(path: number, s: number, out: AiSample): void;
  respawnPose(loc: Readonly<TrackLoc>, out: PoseBaked): void;
  hazardPose(h: number, tick: Tick, out: HazardPose): void;
  /** Main-line s → sMain (identity on circuits); branch s → mapped main progress. */
  toMainS(path: number, s: number): number;
  // ---- v2 additions (optional so older implementations/mocks stay valid)
  /** true if sample i of path p is a valid respawn slot (ground, clear of walls, outside gaps/warps/rails). */
  respawnOk?(path: number, i: number): boolean;
  /** The loc of the pose respawnPose() would pick (copy it into race.loc after placing the kart). */
  respawnLoc?(loc: Readonly<TrackLoc>, out: TrackLoc): void;
  /** Indices of zones containing (path, s, u); writes up to `max` into `out`, returns the count. */
  zonesAt?(path: number, s: number, u: number, out: Int32Array | number[], max: number): number;
  /** Sample flags (SFLAG) at (path, s). */
  flagsAt?(path: number, s: number): number;
}

interface PathData { meta: CtrkPathMeta; smp: Float64Array; flg: Uint16Array; ai: Float64Array | null; grav: Float64Array | null; rok: Uint8Array | null; rto: Int32Array | null; lineS: number }

/** Octahedral normals (2 × u16 = (c + 1)·32767.5, y = pole) → unit f64 xyz; arithmetic + sqrt only (deterministic). */
function decodeOct(e: Uint16Array): Float64Array {
  const out = new Float64Array((e.length / 2) * 3);
  for (let i = 0, j = 0; i < e.length; i += 2, j += 3) {
    let u = e[i]! / 32767.5 - 1, v = e[i + 1]! / 32767.5 - 1;
    const y = 1 - (u < 0 ? -u : u) - (v < 0 ? -v : v);
    if (y < 0) { const u2 = (1 - (v < 0 ? -v : v)) * (u >= 0 ? 1 : -1), v2 = (1 - (u < 0 ? -u : u)) * (v >= 0 ? 1 : -1); u = u2; v = v2; }
    const l = Math.sqrt(u * u + y * y + v * v) || 1;
    out[j] = u / l; out[j + 1] = y / l; out[j + 2] = v / l;
  }
  return out;
}

/** f32 arrays (v2 files) are widened once; f64 arrays (v1 files) are used zero-copy. */
function f64(a: TypedArray | undefined): Float64Array | null {
  if (!a) return null;
  return a instanceof Float64Array ? a : Float64Array.from(a as ArrayLike<number>);
}

function hashFrom(arrays: Map<string, unknown>, prefix: string, cells: { cs: number; cy: number }, dims: Float64Array): TriHashData {
  return {
    ox: dims[0]!, oy: dims[1]!, oz: dims[2]!, cs: cells.cs, cy: cells.cy, nx: dims[3]!, ny: dims[4]!, nz: dims[5]!,
    keys: arrays.get(prefix + '.hk') as Float64Array, starts: arrays.get(prefix + '.hs') as Uint32Array, tris: arrays.get(prefix + '.ht') as Uint32Array,
  };
}

const G_WORLD = 28;
/** Barycentric slack of the ground ray: covers f32-rounded T-junction seams (µm cracks) of clipped meshes. */
const BARY_EPS = 1e-5;
const DT = 1 / 60;

class BakedTrackImpl implements BakedTrack {
  readonly id: TrackId; readonly meta: CtrkMeta; readonly hash: string; readonly lapLength: number; readonly laps: number;
  readonly topology: 'circuit' | 'p2p'; readonly nPaths: number; readonly grid: PoseBaked[]; readonly boxes: BoxBaked[];
  readonly pads: PadBaked[]; readonly keyGates: number[]; readonly hazards: HazardDefBaked[]; readonly zones: ZoneBaked[];
  readonly rails: RailBaked[]; readonly warps: WarpBaked[]; readonly jumps: JumpBaked[]; readonly killY: number;
  private paths: PathData[];
  private gPos: Float64Array; private gNrm: Float64Array; private gIdx: Uint32Array | Uint16Array; private gSurf: Uint8Array; private gFlg: Uint8Array; private gHash: TriHashData;
  private wPos: Float64Array; private wIdx: Uint32Array | Uint16Array; private wFlg: Uint8Array; private wHash: TriHashData;
  private seen: Int32Array = new Int32Array(256);
  private tmpFrame: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  private cand: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 };
  private sc = { s: 0, c: 0 };

  constructor(buf: ArrayBuffer) {
    const c = readContainer(buf, CTRK_MAGIC, CTRK_VERSION);
    const m = c.meta as CtrkMeta;
    const A = c.arrays;
    this.meta = m; this.id = m.id; this.hash = m.hash; this.lapLength = m.lapLength; this.laps = m.laps; this.topology = m.topology;
    this.nPaths = m.paths.length; this.grid = m.grid; this.boxes = m.boxes; this.pads = m.pads; this.keyGates = m.keyGates;
    this.hazards = m.hazards; this.zones = m.zones; this.rails = m.rails; this.warps = m.warps; this.jumps = m.jumps; this.killY = m.killY;
    this.paths = m.paths.map((pm, k) => ({
      meta: pm, smp: f64(A.get(`p${k}.smp`))!, flg: A.get(`p${k}.flg`) as Uint16Array, ai: f64(A.get(`p${k}.ai`)),
      grav: f64(A.get(`p${k}.grav`)), rok: (A.get(`p${k}.rok`) as Uint8Array | undefined) ?? null,
      rto: (A.get(`p${k}.rto`) as Int32Array | undefined) ?? null, lineS: pm.lineS ?? 0,
    }));
    this.gPos = f64(A.get('g.pos'))!; this.gNrm = A.has('g.noct') ? decodeOct(A.get('g.noct') as Uint16Array) : f64(A.get('g.nrm'))!; this.gIdx = A.get('g.idx') as Uint32Array | Uint16Array;
    this.gSurf = A.get('g.surf') as Uint8Array; this.gFlg = A.get('g.flg') as Uint8Array;
    this.gHash = hashFrom(A, 'g', m.hashCells, A.get('g.hd') as Float64Array);
    this.wPos = f64(A.get('w.pos'))!; this.wIdx = A.get('w.idx') as Uint32Array | Uint16Array; this.wFlg = A.get('w.flg') as Uint8Array;
    this.wHash = hashFrom(A, 'w', m.hashCells, A.get('w.hd') as Float64Array);
  }

  path(p: number): Readonly<CtrkPathMeta> { return this.paths[p]!.meta; }

  // ---------------------------------------------------------------- ground ray (Möller–Trumbore, front side only)
  groundRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: GroundHit): boolean {
    const h = this.gHash;
    const ex = ox + dx * maxT, ey = oy + dy * maxT, ez = oz + dz * maxT;
    const ix0 = Math.floor(((ox < ex ? ox : ex) - h.ox) / h.cs), ix1 = Math.floor(((ox > ex ? ox : ex) - h.ox) / h.cs);
    const iy0 = Math.floor(((oy < ey ? oy : ey) - h.oy) / h.cy), iy1 = Math.floor(((oy > ey ? oy : ey) - h.oy) / h.cy);
    const iz0 = Math.floor(((oz < ez ? oz : ez) - h.oz) / h.cs), iz1 = Math.floor(((oz > ez ? oz : ez) - h.oz) / h.cs);
    let best = maxT + 1e-9, found = false;
    const P = this.gPos, I = this.gIdx;
    for (let iz = iz0; iz <= iz1; iz++) for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
      if (ix < 0 || iy < 0 || iz < 0 || ix >= h.nx || iy >= h.ny || iz >= h.nz) continue;
      const ci = findCell(h, ix + h.nx * (iy + h.ny * iz));
      if (ci < 0) continue;
      for (let q = h.starts[ci]!; q < h.starts[ci + 1]!; q++) {
        const t = h.tris[q]!;
        const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
        const ax = P[a]!, ay = P[a + 1]!, az = P[a + 2]!;
        const e1x = P[b]! - ax, e1y = P[b + 1]! - ay, e1z = P[b + 2]! - az;
        const e2x = P[c]! - ax, e2y = P[c + 1]! - ay, e2z = P[c + 2]! - az;
        // geometric normal n = e1 × e2 ; front side requires dir·n < 0
        const gnx = e1y * e2z - e1z * e2y, gny = e1z * e2x - e1x * e2z, gnz = e1x * e2y - e1y * e2x;
        if (dx * gnx + dy * gny + dz * gnz >= 0) continue;
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-12 && det < 1e-12) continue;
        const inv = 1 / det;
        const sx = ox - ax, sy = oy - ay, sz = oz - az;
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < -BARY_EPS || u > 1 + BARY_EPS) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < -BARY_EPS || u + v > 1 + BARY_EPS) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt < 0 || tt >= best) continue;
        best = tt; found = true;
        const w = 1 - u - v, N = this.gNrm;
        let nx = N[a]! * w + N[b]! * u + N[c]! * v, ny = N[a + 1]! * w + N[b + 1]! * u + N[c + 1]! * v, nz = N[a + 2]! * w + N[b + 2]! * u + N[c + 2]! * v;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl > 1e-12) { nx /= nl; ny /= nl; nz /= nl; } else { const gl = Math.sqrt(gnx * gnx + gny * gny + gnz * gnz); nx = gnx / gl; ny = gny / gl; nz = gnz / gl; }
        out.t = tt; out.x = ox + dx * tt; out.y = oy + dy * tt; out.z = oz + dz * tt;
        out.nx = nx; out.ny = ny; out.nz = nz; out.surf = this.gSurf[t]!; out.tri = t; out.flags = this.gFlg[t]!;
      }
    }
    return found;
  }

  // ---------------------------------------------------------------- sphere vs wall triangles (closest point, Ericson)
  sphereWalls(cx: number, cy: number, cz: number, r: number, out: Contact[], max: number): number {
    const h = this.wHash;
    const ix0 = Math.floor((cx - r - h.ox) / h.cs), ix1 = Math.floor((cx + r - h.ox) / h.cs);
    const iy0 = Math.floor((cy - r - h.oy) / h.cy), iy1 = Math.floor((cy + r - h.oy) / h.cy);
    const iz0 = Math.floor((cz - r - h.oz) / h.cs), iz1 = Math.floor((cz + r - h.oz) / h.cs);
    let n = 0, nSeen = 0;
    const P = this.wPos, I = this.wIdx, seen = this.seen, r2 = r * r;
    for (let iz = iz0; iz <= iz1; iz++) for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
      if (ix < 0 || iy < 0 || iz < 0 || ix >= h.nx || iy >= h.ny || iz >= h.nz) continue;
      const ci = findCell(h, ix + h.nx * (iy + h.ny * iz));
      if (ci < 0) continue;
      for (let q = h.starts[ci]!; q < h.starts[ci + 1]!; q++) {
        const t = h.tris[q]!;
        let dup = false;
        for (let k = 0; k < nSeen; k++) if (seen[k] === t) { dup = true; break; }
        if (dup) continue;
        if (nSeen < seen.length) seen[nSeen++] = t;
        const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
        closestPointTri(cx, cy, cz, P[a]!, P[a + 1]!, P[a + 2]!, P[b]!, P[b + 1]!, P[b + 2]!, P[c]!, P[c + 1]!, P[c + 2]!, CP);
        const dx = cx - CP.x, dy = cy - CP.y, dz = cz - CP.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) continue;
        const d = Math.sqrt(d2);
        let nx: number, ny: number, nz: number;
        if (d > 1e-9) { nx = dx / d; ny = dy / d; nz = dz / d; }
        else {
          const e1x = P[b]! - P[a]!, e1y = P[b + 1]! - P[a + 1]!, e1z = P[b + 2]! - P[a + 2]!;
          const e2x = P[c]! - P[a]!, e2y = P[c + 1]! - P[a + 1]!, e2z = P[c + 2]! - P[a + 2]!;
          nx = e1y * e2z - e1z * e2y; ny = e1z * e2x - e1x * e2z; nz = e1x * e2y - e1y * e2x;
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
        }
        if (n < max) {
          const o = out[n]!;
          o.x = CP.x; o.y = CP.y; o.z = CP.z; o.nx = nx; o.ny = ny; o.nz = nz; o.depth = r - d; o.flags = this.wFlg[t]!; o.tri = t;
          n++;
        }
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- spline graph
  private projectOn(pd: PathData, pathIdx: number, i: number, px: number, py: number, pz: number, out: TrackLoc): number {
    const S = pd.smp, st = SMP.STRIDE, a = i * st, b = (i + 1) * st;
    const ax = S[a]!, ay = S[a + 1]!, az = S[a + 2]!;
    const ex = S[b]! - ax, ey = S[b + 1]! - ay, ez = S[b + 2]! - az;
    const L2 = ex * ex + ey * ey + ez * ez;
    let t = L2 > 1e-12 ? ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + ex * t, cy = ay + ey * t, cz = az + ez * t;
    const rx = S[a + SMP.RX]! + (S[b + SMP.RX]! - S[a + SMP.RX]!) * t, ry = S[a + SMP.RY]! + (S[b + SMP.RY]! - S[a + SMP.RY]!) * t, rz = S[a + SMP.RZ]! + (S[b + SMP.RZ]! - S[a + SMP.RZ]!) * t;
    const ux = S[a + SMP.UX]! + (S[b + SMP.UX]! - S[a + SMP.UX]!) * t, uy = S[a + SMP.UY]! + (S[b + SMP.UY]! - S[a + SMP.UY]!) * t, uz = S[a + SMP.UZ]! + (S[b + SMP.UZ]! - S[a + SMP.UZ]!) * t;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    out.path = pathIdx; out.i = i;
    out.s = S[a + SMP.S]! + (S[b + SMP.S]! - S[a + SMP.S]!) * t;
    out.u = dx * rx + dy * ry + dz * rz;
    out.h = dx * ux + dy * uy + dz * uz;
    out.sMain = S[a + SMP.SMAIN]! + (S[b + SMP.SMAIN]! - S[a + SMP.SMAIN]!) * t;
    const L = this.lapLength;
    if (this.topology === 'circuit' && out.sMain >= L) out.sMain -= L;
    const wL = S[a + SMP.WL]!, wR = S[a + SMP.WR]!;
    const lateralOk = out.u <= wR + 3 && out.u >= -wL - 3;
    // a kart flying a jump sits well above (or, falling short, below) the gap chord and the landing: widen the
    // stacked-deck window there so progress tracks the flight instead of snapping back onto the ramp
    const fj = (pd.flg[i]! | pd.flg[i + 1]!) & (SFLAG.JUMP | SFLAG.NO_GROUND);
    const hLo = fj === (SFLAG.JUMP | SFLAG.NO_GROUND) ? -30 : -2, hHi = fj === (SFLAG.JUMP | SFLAG.NO_GROUND) ? 30 : fj === SFLAG.JUMP ? 20 : 6;
    const heightOk = out.h >= hLo && out.h <= hHi;
    out.valid = lateralOk && heightOk ? 1 : 0;
    return dx * dx + dy * dy + dz * dz;
  }

  private searchWindow(pathIdx: number, center: number, back: number, fwd: number, px: number, py: number, pz: number, best: { d: number }, out: TrackLoc, bias: number): void {
    const pd = this.paths[pathIdx]!;
    const nSeg = pd.meta.n - 1;
    for (let k = -back; k <= fwd; k++) {
      let i = center + k;
      if (pd.meta.closed) { i %= nSeg; if (i < 0) i += nSeg; }
      else if (i < 0 || i >= nSeg) continue;
      const d = this.projectOn(pd, pathIdx, i, px, py, pz, this.cand) + bias;
      if (this.cand.valid && d < best.d) { best.d = d; copyLoc(out, this.cand); }
    }
  }

  private indexOf(pd: PathData, s: number): number {
    return Math.max(0, Math.min(pd.meta.n - 2, Math.floor(s / pd.meta.ds)));
  }

  locate(px: number, py: number, pz: number, prev: Readonly<TrackLoc>, out: TrackLoc): boolean {
    const best = BEST; best.d = 1e30;
    const pd = this.paths[prev.path] ?? this.paths[0]!;
    const pi = this.paths[prev.path] ? prev.path : 0;
    this.searchWindow(pi, prev.i, 20, 40, px, py, pz, best, out, 0);
    // follow links (branch split/merge, rail exit) near the current position; other paths pay a small bias so the
    // kart keeps its path through overlapping junction surfaces (hysteresis)
    const links = pd.meta.links;
    if (links) for (let k = 0; k < links.length; k++) {
      const ln = links[k]!;
      let ds = prev.s - ln.at;
      if (pd.meta.closed) { const L = pd.meta.length; if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L; }
      if (ds < -40 || ds > 45) continue;
      const tp = this.paths[ln.to]!;
      if (tp.meta.kind === 'rail' && ln.kind === 'railIn') continue; // rails are entered by capture only
      this.searchWindow(ln.to, this.indexOf(tp, ln.toS), 30, 45, px, py, pz, best, out, 1.0);
    }
    if (best.d < 1e29) return true;
    // wider search on the same path before giving up (respawn walk-back, long frames)
    this.searchWindow(pi, prev.i, 90, 90, px, py, pz, best, out, 0);
    if (best.d < 1e29) return true;
    copyLoc(out, prev); out.valid = 0;
    return false;
  }

  locateGlobal(px: number, py: number, pz: number, out: TrackLoc): boolean {
    let bestD = 1e30, bestP = -1, bestI = 0;
    for (let p = 0; p < this.paths.length; p++) {
      const pd = this.paths[p]!, S = pd.smp, st = SMP.STRIDE;
      if (pd.meta.kind === 'rail') continue;
      for (let i = 0; i < pd.meta.n - 1; i += 2) {
        const dx = S[i * st]! - px, dy = S[i * st + 1]! - py, dz = S[i * st + 2]! - pz;
        const d = dx * dx + 4 * dy * dy + dz * dz;
        if (d < bestD) { bestD = d; bestP = p; bestI = i; }
      }
    }
    if (bestP < 0) { out.valid = 0; return false; }
    const best = BEST; best.d = 1e30;
    this.searchWindow(bestP, bestI, 6, 6, px, py, pz, best, out, 0);
    if (best.d < 1e29) return true;
    this.projectOn(this.paths[bestP]!, bestP, Math.min(bestI, this.paths[bestP]!.meta.n - 2), px, py, pz, out);
    out.valid = 0;
    return false;
  }

  private indexAt(pd: PathData, s: number): number {
    const nSeg = pd.meta.n - 1;
    let ss = s;
    if (pd.meta.closed) { const L = pd.meta.length; ss = s - L * Math.floor(s / L); }
    let i = Math.floor(ss / pd.meta.ds);
    if (i < 0) i = 0; if (i > nSeg - 1) i = nSeg - 1;
    const S = pd.smp, st = SMP.STRIDE;
    while (i > 0 && S[i * st + SMP.S]! > ss) i--;
    while (i < nSeg - 1 && S[(i + 1) * st + SMP.S]! <= ss) i++;
    return i;
  }

  frameAt(path: number, s: number, out: FrameSample): void {
    const pd = this.paths[path]!, S = pd.smp, st = SMP.STRIDE;
    const i = this.indexAt(pd, s);
    let ss = s;
    if (pd.meta.closed) { const L = pd.meta.length; ss = s - L * Math.floor(s / L); }
    const a = i * st, b = (i + 1) * st;
    const s0 = S[a + SMP.S]!, s1 = S[b + SMP.S]!;
    let t = s1 > s0 ? (ss - s0) / (s1 - s0) : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.px = S[a]! + (S[b]! - S[a]!) * t; out.py = S[a + 1]! + (S[b + 1]! - S[a + 1]!) * t; out.pz = S[a + 2]! + (S[b + 2]! - S[a + 2]!) * t;
    out.tx = S[a + 3]! + (S[b + 3]! - S[a + 3]!) * t; out.ty = S[a + 4]! + (S[b + 4]! - S[a + 4]!) * t; out.tz = S[a + 5]! + (S[b + 5]! - S[a + 5]!) * t;
    out.rx = S[a + 6]! + (S[b + 6]! - S[a + 6]!) * t; out.ry = S[a + 7]! + (S[b + 7]! - S[a + 7]!) * t; out.rz = S[a + 8]! + (S[b + 8]! - S[a + 8]!) * t;
    out.ux = S[a + 9]! + (S[b + 9]! - S[a + 9]!) * t; out.uy = S[a + 10]! + (S[b + 10]! - S[a + 10]!) * t; out.uz = S[a + 11]! + (S[b + 11]! - S[a + 11]!) * t;
    normalizeFrame(out);
    out.wL = S[a + SMP.WL]! + (S[b + SMP.WL]! - S[a + SMP.WL]!) * t; out.wR = S[a + SMP.WR]! + (S[b + SMP.WR]! - S[a + SMP.WR]!) * t;
    out.sMain = S[a + SMP.SMAIN]! + (S[b + SMP.SMAIN]! - S[a + SMP.SMAIN]!) * t;
    if (this.topology === 'circuit' && out.sMain >= this.lapLength) out.sMain -= this.lapLength;
    out.flags = pd.flg[t < 0.5 ? i : i + 1]!;
  }

  gravityAt(loc: Readonly<TrackLoc>, out: GravityOut): void {
    const pd = this.paths[loc.path]!;
    const fl = pd.flg[loc.i] ?? 0;
    const mode = ((fl & SFLAG.GRAV_MASK) >> SFLAG.GRAV_SHIFT) as GravMode;
    if (mode === 1) {
      const S = pd.smp, a = loc.i * SMP.STRIDE;
      out.x = -S[a + SMP.UX]! * G_WORLD; out.y = -S[a + SMP.UY]! * G_WORLD; out.z = -S[a + SMP.UZ]! * G_WORLD; out.scale = 1;
    } else {
      const sc = mode === 2 ? (pd.grav ? pd.grav[loc.i]! : (pd.meta.gravityScale ?? 0.4)) : 1;
      out.x = 0; out.y = -G_WORLD * sc; out.z = 0; out.scale = sc;
    }
  }

  aiAt(path: number, s: number, out: AiSample): void {
    const pd = this.paths[path]!;
    const i = this.indexAt(pd, s);
    const A = pd.ai;
    if (!A) { out.lineU = 0; out.vLim = 99; out.kappa = 0; out.turnAhead40 = 0; out.driftZone = 0; out.width = 12; return; }
    const o = i * AIS.STRIDE;
    out.lineU = A[o + AIS.LINE_U]!; out.vLim = A[o + AIS.VLIM]!; out.kappa = A[o + AIS.KAPPA]!;
    out.turnAhead40 = A[o + AIS.TURN40]!; out.driftZone = A[o + AIS.ZONE]!; out.width = A[o + AIS.WIDTH]!;
  }

  respawnOk(path: number, i: number): boolean {
    const pd = this.paths[path];
    if (!pd) return false;
    return pd.rok ? pd.rok[i] === 1 : true;
  }

  /** The sample a kart whose last valid location is `loc` is placed on, or −1 (respawn in place).
   *  v2 tracks bake it per sample (p{k}.rto: jump-aware, never across the finish or forwards across a key gate);
   *  older bakes walk back ≤ 15 samples to the nearest respawn-ok sample of the same path. */
  private respawnIndex(loc: Readonly<TrackLoc>): number {
    const pd = this.paths[loc.path]!;
    const nSeg = pd.meta.n - 1;
    const i = this.indexAt(pd, loc.s);
    if (pd.rto) return pd.rto[i]!;
    if (!pd.rok) return -1;
    for (let k = 0; k <= 15; k++) {
      let j = i - k;
      if (pd.meta.closed) { j %= nSeg; if (j < 0) j += nSeg; } else if (j < 0) break;
      if (pd.rok[j] === 1) return j;
    }
    return -1;
  }

  respawnLoc(loc: Readonly<TrackLoc>, out: TrackLoc): void {
    copyLoc(out, loc);
    const j = this.respawnIndex(loc);
    if (j < 0) return;
    const pd = this.paths[loc.path]!, S = pd.smp, a = j * SMP.STRIDE;
    out.i = j; out.s = S[a + SMP.S]!; out.sMain = S[a + SMP.SMAIN]!; out.u = 0; out.h = 0; out.valid = 1;
    if (this.topology === 'circuit' && out.sMain >= this.lapLength) out.sMain -= this.lapLength;
  }

  respawnPose(loc: Readonly<TrackLoc>, out: PoseBaked): void {
    const f = this.tmpFrame;
    const j = this.respawnIndex(loc);
    const pd = this.paths[loc.path]!;
    const s = j >= 0 ? pd.smp[j * SMP.STRIDE + SMP.S]! : loc.s;
    this.frameAt(loc.path, s, f);
    // keep a little of the lateral offset, clamped well inside the road
    const lim = (f.wL < f.wR ? f.wL : f.wR) - 2.5;
    const u = j < 0 && lim > 0 ? (loc.u > lim ? lim : loc.u < -lim ? -lim : loc.u) * 0.3 : 0;
    out.x = f.px + f.rx * u; out.y = f.py + f.ry * u; out.z = f.pz + f.rz * u;
    out.fx = f.tx; out.fy = f.ty; out.fz = f.tz;
  }

  hazardPose(h: number, tick: Tick, out: HazardPose): void {
    const hz = this.hazards[h];
    if (!hz) { out.x = out.y = out.z = 0; out.active = 0; out.telegraph = 0; return; }
    const P = hz.periodTicks > 0 ? hz.periodTicks : 1;
    const ph = ((tick + hz.offsetTicks) % P + P) % P;
    out.active = ph >= hz.activeFrom && ph < hz.activeTo ? 1 : 0;
    out.telegraph = !out.active && ph >= hz.activeFrom - hz.telegraphTicks && ph < hz.activeFrom ? 1 : 0;
    out.phase = ph / P;
    const mo = hz.motion;
    const f = this.tmpFrame;
    let s = hz.s, u = hz.u, hh = hz.h ?? 0;
    if (mo && mo.type === 'lane') {
      // travels s0 → s1 at |speed| (direction by sign); position is a pure function of the phase
      const s0 = mo.s0 ?? hz.s, s1 = mo.s1 ?? hz.s + 100, span = s1 - s0, v = mo.speed ?? 10;
      let d = (ph * DT * (v < 0 ? -v : v)) % span;
      if (d < 0) d += span;
      s = v >= 0 ? s0 + d : s1 - d;
      out.active = 1; out.telegraph = 0;
    }
    this.frameAt(hz.path, s, f);
    let fx = f.tx, fy = f.ty, fz = f.tz, ux = f.ux, uy = f.uy, uz = f.uz;
    if (mo && mo.type === 'cross') {
      // crosses the road along the track right vector during the active window, parked off-road otherwise
      const half = mo.halfSpan ?? 20;
      const span = hz.activeTo - hz.activeFrom;
      const q = span > 0 ? (ph - hz.activeFrom) / span : 0;
      u = hz.u + (out.active ? -half + 2 * half * q : q < 0 ? -half - 40 : half + 40);
      fx = f.rx; fy = f.ry; fz = f.rz;
    } else if (mo && mo.type === 'piston') {
      // raised by `rise` outside the active phase, eased over rampTicks at both ends
      const rise = mo.rise ?? 4, ramp = mo.rampTicks ?? 10;
      let k = 1;
      if (ph >= hz.activeFrom && ph < hz.activeTo) {
        const a = ph - hz.activeFrom, b = hz.activeTo - ph;
        k = a < ramp ? 1 - a / ramp : b < ramp ? 1 - b / ramp : 0;
      }
      hh += rise * k;
    } else if (mo && (mo.type === 'pendulum' || mo.type === 'rotate')) {
      // angle θ(phase): pendulum amp·sin(2π·phase), rotate 2π·phase; bob at arm length below/around the pivot
      const TAU = 6.283185307179586;
      let th: number;
      if (mo.type === 'rotate') th = TAU * (ph / P);
      else { detSinCos(TAU * (ph / P), this.sc); th = ((mo.ampDeg ?? 60) * 0.017453292519943295) * this.sc.s; }
      detSinCos(th, this.sc);
      const arm = mo.arm ?? 5, piv = mo.pivotH ?? arm + 1.5;
      if (mo.plane === 'flat') {
        // horizontal sweep at pivot height: θ = 0 points down the track, + turns towards the right
        const cx = f.tx * this.sc.c + f.rx * this.sc.s, cy = f.ty * this.sc.c + f.ry * this.sc.s, cz = f.tz * this.sc.c + f.rz * this.sc.s;
        out.x = f.px + f.rx * u + f.ux * piv + cx * arm;
        out.y = f.py + f.ry * u + f.uy * piv + cy * arm;
        out.z = f.pz + f.rz * u + f.uz * piv + cz * arm;
        // forward = the arm direction (pivot → tip); up stays the track up
        out.fx = cx; out.fy = cy; out.fz = cz; out.ux = f.ux; out.uy = f.uy; out.uz = f.uz;
        return;
      }
      // swing plane: across the road (right/up) or along it (forward/up)
      const ax = mo.plane === 'along' ? f.tx : f.rx, ay = mo.plane === 'along' ? f.ty : f.ry, az = mo.plane === 'along' ? f.tz : f.rz;
      const lat = arm * this.sc.s, dn = arm * this.sc.c;
      out.x = f.px + f.rx * u + f.ux * (piv - dn) + ax * lat;
      out.y = f.py + f.ry * u + f.uy * (piv - dn) + ay * lat;
      out.z = f.pz + f.rz * u + f.uz * (piv - dn) + az * lat;
      // arm direction (pivot → bob) is the shape's up axis
      ux = -(ax * this.sc.s) + f.ux * this.sc.c; uy = -(ay * this.sc.s) + f.uy * this.sc.c; uz = -(az * this.sc.s) + f.uz * this.sc.c;
      out.fx = fx; out.fy = fy; out.fz = fz; out.ux = ux; out.uy = uy; out.uz = uz;
      return;
    }
    out.x = f.px + f.rx * u + f.ux * hh; out.y = f.py + f.ry * u + f.uy * hh; out.z = f.pz + f.rz * u + f.uz * hh;
    out.fx = fx; out.fy = fy; out.fz = fz; out.ux = ux; out.uy = uy; out.uz = uz;
  }

  zonesAt(path: number, s: number, u: number, out: Int32Array | number[], max: number): number {
    let n = 0;
    const Z = this.zones, pd = this.paths[path]!;
    for (let k = 0; k < Z.length && n < max; k++) {
      const z = Z[k]!;
      if (z.path !== path || z.aabb) continue;
      let ss = s;
      if (pd.meta.closed) { const L = pd.meta.length; if (ss < z.s0) ss += L; if (ss > z.s1 + L) ss -= L; }
      if (ss >= z.s0 && ss <= z.s1 && u >= z.u0 && u <= z.u1) out[n++] = k;
    }
    return n;
  }

  flagsAt(path: number, s: number): number {
    const pd = this.paths[path]!;
    return pd.flg[this.indexAt(pd, s)]!;
  }

  toMainS(path: number, s: number): number {
    const pd = this.paths[path]!;
    if (path === 0) return this.topology === 'p2p' ? s - pd.lineS : s;
    const pm = pd.meta;
    if (!pm.map) return 0;
    let to = pm.map.toS;
    if (to < pm.map.fromS) to += this.paths[0]!.meta.length;
    let v = pm.map.fromS + (to - pm.map.fromS) * (s / pm.length);
    const L = this.paths[0]!.meta.length;
    if (this.topology === 'circuit' && v >= L) v -= L;
    return v;
  }
}

const BEST = { d: 0 };
const CP = { x: 0, y: 0, z: 0 };

export function copyLoc(dst: TrackLoc, src: Readonly<TrackLoc>): TrackLoc {
  dst.path = src.path; dst.i = src.i; dst.s = src.s; dst.u = src.u; dst.h = src.h; dst.sMain = src.sMain; dst.valid = src.valid;
  return dst;
}

function normalizeFrame(f: FrameSample): void {
  let l = Math.sqrt(f.tx * f.tx + f.ty * f.ty + f.tz * f.tz) || 1; f.tx /= l; f.ty /= l; f.tz /= l;
  l = Math.sqrt(f.rx * f.rx + f.ry * f.ry + f.rz * f.rz) || 1; f.rx /= l; f.ry /= l; f.rz /= l;
  l = Math.sqrt(f.ux * f.ux + f.uy * f.uy + f.uz * f.uz) || 1; f.ux /= l; f.uy /= l; f.uz /= l;
}

/** Closest point on triangle ABC to P (Ericson, Real-Time Collision Detection §5.1.5). */
export function closestPointTri(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, out: { x: number; y: number; z: number }): void {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out.x = ax; out.y = ay; out.z = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out.x = bx; out.y = by; out.z = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out.x = ax + abx * v; out.y = ay + aby * v; out.z = az + abz * v; return; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out.x = cx; out.y = cy; out.z = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out.x = ax + acx * w; out.y = ay + acy * w; out.z = az + acz * w; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out.x = bx + (cx - bx) * w; out.y = by + (cy - by) * w; out.z = bz + (cz - bz) * w; return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  out.x = ax + abx * v + acx * w; out.y = ay + aby * v + acy * w; out.z = az + abz * v + acz * w;
}

export function loadCtrk(buf: ArrayBuffer): BakedTrack {
  return new BakedTrackImpl(buf);
}
