// FROZEN interface (review-enforced, not hash-locked: lanes L1/L4 extend the implementation). Runtime view of a baked .ctrk track: collision queries + spline graph.
// All queries are deterministic (arithmetic + sqrt) and allocation-free.
import type { TrackId } from '@cr/content';
import type { Tick } from '../core/units.ts';
import type { TrackLoc } from '../core/state.ts';
import { readContainer } from './container.ts';
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
export interface HazardPose { x: number; y: number; z: number; active: 0 | 1; telegraph: 0 | 1 }

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
  /** Main-line s → sMain (identity on main); branch s → mapped main progress. */
  toMainS(path: number, s: number): number;
}

interface PathData { meta: CtrkPathMeta; smp: Float64Array; flg: Uint16Array; ai: Float64Array | null }

function hashFrom(arrays: Map<string, unknown>, prefix: string, cells: { cs: number; cy: number }, dims: Float64Array): TriHashData {
  return {
    ox: dims[0]!, oy: dims[1]!, oz: dims[2]!, cs: cells.cs, cy: cells.cy, nx: dims[3]!, ny: dims[4]!, nz: dims[5]!,
    keys: arrays.get(prefix + '.hk') as Float64Array, starts: arrays.get(prefix + '.hs') as Uint32Array, tris: arrays.get(prefix + '.ht') as Uint32Array,
  };
}

const G_WORLD = 28;

class BakedTrackImpl implements BakedTrack {
  readonly id: TrackId; readonly meta: CtrkMeta; readonly hash: string; readonly lapLength: number; readonly laps: number;
  readonly topology: 'circuit' | 'p2p'; readonly nPaths: number; readonly grid: PoseBaked[]; readonly boxes: BoxBaked[];
  readonly pads: PadBaked[]; readonly keyGates: number[]; readonly hazards: HazardDefBaked[]; readonly zones: ZoneBaked[];
  readonly rails: RailBaked[]; readonly warps: WarpBaked[]; readonly jumps: JumpBaked[]; readonly killY: number;
  private paths: PathData[];
  private gPos: Float64Array; private gNrm: Float64Array; private gIdx: Uint32Array; private gSurf: Uint8Array; private gFlg: Uint8Array; private gHash: TriHashData;
  private wPos: Float64Array; private wIdx: Uint32Array; private wFlg: Uint8Array; private wHash: TriHashData;
  private seen: Int32Array = new Int32Array(128);
  private tmpFrame: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  private cand: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 };

  constructor(buf: ArrayBuffer) {
    const c = readContainer(buf, CTRK_MAGIC, CTRK_VERSION);
    const m = c.meta as CtrkMeta;
    const A = c.arrays;
    this.meta = m; this.id = m.id; this.hash = m.hash; this.lapLength = m.lapLength; this.laps = m.laps; this.topology = m.topology;
    this.nPaths = m.paths.length; this.grid = m.grid; this.boxes = m.boxes; this.pads = m.pads; this.keyGates = m.keyGates;
    this.hazards = m.hazards; this.zones = m.zones; this.rails = m.rails; this.warps = m.warps; this.jumps = m.jumps; this.killY = m.killY;
    this.paths = m.paths.map((pm, k) => ({
      meta: pm, smp: A.get(`p${k}.smp`) as Float64Array, flg: A.get(`p${k}.flg`) as Uint16Array, ai: (A.get(`p${k}.ai`) as Float64Array | undefined) ?? null,
    }));
    this.gPos = A.get('g.pos') as Float64Array; this.gNrm = A.get('g.nrm') as Float64Array; this.gIdx = A.get('g.idx') as Uint32Array;
    this.gSurf = A.get('g.surf') as Uint8Array; this.gFlg = A.get('g.flg') as Uint8Array;
    this.gHash = hashFrom(A, 'g', m.hashCells, A.get('g.hd') as Float64Array);
    this.wPos = A.get('w.pos') as Float64Array; this.wIdx = A.get('w.idx') as Uint32Array; this.wFlg = A.get('w.flg') as Uint8Array;
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
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < -1e-9 || u + v > 1 + 1e-9) continue;
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
    if (pathIdx === 0 && pd.meta.closed && out.sMain >= pd.meta.length) out.sMain -= pd.meta.length;
    const wL = S[a + SMP.WL]!, wR = S[a + SMP.WR]!;
    const lateralOk = out.u <= wR + 3 && out.u >= -wL - 3;
    const heightOk = out.h >= -2 && out.h <= 6;
    out.valid = lateralOk && heightOk ? 1 : 0;
    return dx * dx + dy * dy + dz * dz;
  }

  private searchWindow(pathIdx: number, center: number, back: number, fwd: number, px: number, py: number, pz: number, best: { d: number }, out: TrackLoc): void {
    const pd = this.paths[pathIdx]!;
    const nSeg = pd.meta.n - 1;
    for (let k = -back; k <= fwd; k++) {
      let i = center + k;
      if (pd.meta.closed) { i %= nSeg; if (i < 0) i += nSeg; }
      else if (i < 0 || i >= nSeg) continue;
      const d = this.projectOn(pd, pathIdx, i, px, py, pz, this.cand);
      if (this.cand.valid && d < best.d) { best.d = d; copyLoc(out, this.cand); }
    }
  }

  locate(px: number, py: number, pz: number, prev: Readonly<TrackLoc>, out: TrackLoc): boolean {
    const best = BEST; best.d = 1e30;
    this.searchWindow(prev.path, prev.i, 20, 40, px, py, pz, best, out);
    // junctions: branches whose start/end lie near the current main-line position
    for (let p = 1; p < this.paths.length; p++) {
      const pm = this.paths[p]!.meta;
      if (!pm.map) continue;
      if (prev.path === 0) {
        const ds = prev.s - pm.map.fromS;
        if (ds > -30 && ds < 40) this.searchWindow(p, 0, 0, 40, px, py, pz, best, out);
      } else if (prev.path === p) {
        const nSeg = pm.n - 1;
        if (prev.i > nSeg - 40) {
          const mainPd = this.paths[0]!;
          const iMain = Math.floor(pm.map.toS / mainPd.meta.ds);
          this.searchWindow(0, iMain, 10, 30, px, py, pz, best, out);
        }
      }
    }
    if (best.d < 1e29) return true;
    copyLoc(out, prev); out.valid = 0;
    return false;
  }

  locateGlobal(px: number, py: number, pz: number, out: TrackLoc): boolean {
    let bestD = 1e30, bestP = -1, bestI = 0;
    for (let p = 0; p < this.paths.length; p++) {
      const pd = this.paths[p]!, S = pd.smp, st = SMP.STRIDE;
      for (let i = 0; i < pd.meta.n - 1; i += 2) {
        const dx = S[i * st]! - px, dy = S[i * st + 1]! - py, dz = S[i * st + 2]! - pz;
        const d = dx * dx + 4 * dy * dy + dz * dz;
        if (d < bestD) { bestD = d; bestP = p; bestI = i; }
      }
    }
    if (bestP < 0) { out.valid = 0; return false; }
    const best = BEST; best.d = 1e30;
    this.searchWindow(bestP, bestI, 6, 6, px, py, pz, best, out);
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
    const L = (k: number): number => S[a + k]! + (S[b + k]! - S[a + k]!) * t;
    out.px = L(SMP.PX); out.py = L(SMP.PY); out.pz = L(SMP.PZ);
    out.tx = L(SMP.TX); out.ty = L(SMP.TY); out.tz = L(SMP.TZ);
    out.rx = L(SMP.RX); out.ry = L(SMP.RY); out.rz = L(SMP.RZ);
    out.ux = L(SMP.UX); out.uy = L(SMP.UY); out.uz = L(SMP.UZ);
    normalizeFrame(out);
    out.wL = L(SMP.WL); out.wR = L(SMP.WR); out.sMain = L(SMP.SMAIN);
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
      const sc = mode === 2 ? (pd.meta.gravityScale ?? 0.4) : 1;
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

  respawnPose(loc: Readonly<TrackLoc>, out: PoseBaked): void {
    const f = this.tmpFrame;
    this.frameAt(loc.path, loc.s, f);
    // keep a little of the lateral offset, clamped well inside the road
    const lim = Math.min(f.wL, f.wR) - 2.5;
    const u = lim > 0 ? (loc.u > lim ? lim : loc.u < -lim ? -lim : loc.u) * 0.3 : 0;
    out.x = f.px + f.rx * u; out.y = f.py + f.ry * u; out.z = f.pz + f.rz * u;
    out.fx = f.tx; out.fy = f.ty; out.fz = f.tz;
  }

  hazardPose(h: number, tick: Tick, out: HazardPose): void {
    const hz = this.hazards[h];
    if (!hz) { out.x = out.y = out.z = 0; out.active = 0; out.telegraph = 0; return; }
    const f = this.tmpFrame;
    this.frameAt(hz.path, hz.s, f);
    out.x = f.px + f.rx * hz.u; out.y = f.py + f.ry * hz.u; out.z = f.pz + f.rz * hz.u;
    const ph = ((tick + hz.offsetTicks) % hz.periodTicks + hz.periodTicks) % hz.periodTicks;
    out.active = ph >= hz.activeFrom && ph < hz.activeTo ? 1 : 0;
    out.telegraph = !out.active && ph >= hz.activeFrom - hz.telegraphTicks && ph < hz.activeFrom ? 1 : 0;
  }

  toMainS(path: number, s: number): number {
    if (path === 0) return s;
    const pm = this.paths[path]!.meta;
    if (!pm.map) return 0;
    let to = pm.map.toS;
    if (to < pm.map.fromS) to += this.paths[0]!.meta.length;
    let v = pm.map.fromS + (to - pm.map.fromS) * (s / pm.length);
    const L = this.paths[0]!.meta.length;
    if (v >= L) v -= L;
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
