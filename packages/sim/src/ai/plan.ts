// Per-track AI plan: dense 1 m arrays derived once from the baked track (frameAt/aiAt) plus a corner list,
// so the per-tick driver only does typed-array reads (no track queries, no allocation). Cached per track.
// 2D frame everywhere in the AI: X = world x, Y = −world z (counter-clockwise, + = left, like the sim's yaw).
import type { BakedTrack, AiSample, FrameSample } from '../track/BakedTrack.ts';
import { gripGain, type KartParams } from '../kart/params.ts';
import { relaxRacingLine } from './line.ts';

/** A corner on one path: a run of same-direction curvature with at least ~17° of turning. */
export interface Corner {
  s0: number;          // entry (m on the path)
  s1: number;          // exit
  sApex: number;       // sample of peak curvature
  dir: 1 | -1;         // +1 left, −1 right
  turn: number;        // total heading change (rad, > 0)
  minR: number;        // tightest centreline radius (m)
  needsDrift: boolean; // the §3.4 trigger would fire at grip top speed
  vDrift: number;      // lowest baked vLim inside the corner (m/s)
  gripRatio: number;   // grip-only corner speed / vDrift for a Balance kart (≥ 1: gripping costs nothing)
}

export interface PathPlan {
  readonly index: number;
  readonly n: number;          // unique samples (closed paths wrap: sample n ≡ sample 0)
  readonly ds: number;
  readonly length: number;
  readonly closed: boolean;
  readonly X: Float64Array; readonly Y: Float64Array; readonly H: Float64Array;
  readonly TX: Float64Array; readonly TY: Float64Array;   // 2D unit tangent
  readonly HW: Float64Array;   // paved half-width (m)
  readonly WALL: Float64Array; // half-width to the walls/shoulder edge (m)
  readonly LINE: Float64Array; // racing-line offset (m, + = right)
  readonly LK: Float64Array;   // racing-line curvature (+ = left)
  /** 0..1 share of the racing line to follow: 0 around drift corners, where the validated centreline
   *  approach (outside bias, heading-pursuit drift) is faster than the grip line; 1 on sweepers and straights. */
  readonly LINEW: Float64Array;
  readonly KAP: Float64Array;  // centreline curvature (+ = left)
  readonly KEFF: Float64Array; // κ / (1 + 0.6·hw·|κ|): curvature with the width allowance of the drift trigger
  readonly VLIM: Float64Array; // yaw-budget speed limit incl. braking distance
  readonly T40: Float64Array;  // heading change over the next 40 m (rad, signed)
  readonly STRAIGHT: Float64Array; // metres of boost-speed road ahead (R_eff ≥ 90 m)
  readonly CORNER: Int16Array; // corner that sample lies in, or the next one ahead (−1 none)
  readonly corners: readonly Corner[];
  /** Successor for open paths: where s beyond the end continues (branch → host main line). */
  readonly next: { path: number; s: number } | null;
}

export interface TrackPlan {
  readonly paths: readonly PathPlan[];
  /** Drift-worthy corners per lap on the main line (mistake rolls use mistakeRate / zonesPerLap). */
  readonly zonesPerLap: number;
  /** True when the baked track carried a racing line (else the plan relaxed one itself). */
  readonly bakedLine: boolean;
  /** Grip-plan speed tables per yGrip value (lazily built, shared by every bot on the track). */
  readonly gripCache: Map<number, Float64Array[]>;
}

const CACHE = new WeakMap<BakedTrack, TrackPlan>();

/** Racing-line fade around drift corners (metres before entry / after exit). Mutable for tools/balance experiments. */
export const LINE_FADE = { before0: 90, before1: 60, after0: 25, after1: 55, sweepPad: 40, base: 0 };

/** K_BOOST: curvature above which a 44 m/s booster would have to slow (R_eff < 90 m). */
const K_BOOST = 1 / 90;
const K_CORNER = 1 / 160;
const R_BIAS = 0.6;

export function planFor(track: BakedTrack): TrackPlan {
  let p = CACHE.get(track);
  if (!p) { p = buildPlan(track); CACHE.set(track, p); }
  return p;
}

function buildPlan(track: BakedTrack): TrackPlan {
  const F: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  const A: AiSample = { lineU: 0, vLim: 99, kappa: 0, turnAhead40: 0, driftZone: 0, width: 8 };
  const paths: PathPlan[] = [];
  let anyLine = false;
  for (let pi = 0; pi < track.nPaths; pi++) {
    const meta = track.path(pi);
    const L = meta.length;
    const closed = meta.closed;
    const n = Math.max(4, closed ? Math.round(L) : Math.round(L) + 1);
    const ds = closed ? L / n : L / (n - 1);
    const X = new Float64Array(n), Y = new Float64Array(n), H = new Float64Array(n), TX = new Float64Array(n), TY = new Float64Array(n);
    const HW = new Float64Array(n), WALL = new Float64Array(n), LINE = new Float64Array(n), KAP = new Float64Array(n), VLIM = new Float64Array(n), T40 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      track.frameAt(pi, s, F);
      track.aiAt(pi, s, A);
      X[i] = F.px; Y[i] = -F.pz; H[i] = F.py;
      let tx = F.tx, ty = -F.tz;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
      TX[i] = tx; TY[i] = ty;
      const wall = Math.min(F.wL, F.wR);
      WALL[i] = wall;
      // paved half-width from the AI table; never wider than the walls
      HW[i] = Math.max(2.5, Math.min(A.width > 0 ? A.width : wall, wall));
      LINE[i] = A.lineU; KAP[i] = A.kappa; VLIM[i] = A.vLim; T40[i] = A.turnAhead40;
      if (A.lineU !== 0) anyLine = true;
    }
    paths.push({
      index: pi, n, ds, length: L, closed, X, Y, H, TX, TY, HW, WALL, LINE, KAP, VLIM, T40,
      LK: new Float64Array(n), LINEW: new Float64Array(n).fill(1), KEFF: new Float64Array(n), STRAIGHT: new Float64Array(n), CORNER: new Int16Array(n).fill(-1), corners: [],
      next: null,
    });
  }
  // old bakes carry lineU = 0 everywhere: relax a line here with the same algorithm the bake uses
  if (!anyLine) for (const pp of paths) relaxInto(pp);
  for (const pp of paths) derive(pp, track);
  let zones = 0;
  if (paths[0]) for (const c of paths[0].corners) if (c.needsDrift) zones++;
  return { paths, zonesPerLap: zones, bakedLine: anyLine, gripCache: new Map() };
}

function relaxInto(pp: PathPlan): void {
  const n = pp.n, RX = new Float64Array(n), RY = new Float64Array(n), lim = new Float64Array(n);
  for (let i = 0; i < n; i++) { RX[i] = pp.TY[i]!; RY[i] = -pp.TX[i]!; lim[i] = Math.max(0, pp.HW[i]! - 1.6); }
  const a = relaxRacingLine(pp.X, pp.Y, RX, RY, lim, pp.closed, pp.ds);
  (pp.LINE as Float64Array).set(a);
}

const wrapI = (pp: PathPlan, i: number): number => (pp.closed ? ((i % pp.n) + pp.n) % pp.n : i < 0 ? 0 : i >= pp.n ? pp.n - 1 : i);

function derive(pp: PathPlan, track: BakedTrack): void {
  const n = pp.n, ds = pp.ds;
  const KEFF = pp.KEFF as Float64Array, LK = pp.LK as Float64Array, STRAIGHT = pp.STRAIGHT as Float64Array, CORNER = pp.CORNER as Int16Array;
  for (let i = 0; i < n; i++) { const k = pp.KAP[i]!; KEFF[i] = k / (1 + R_BIAS * pp.HW[i]! * Math.abs(k)); }
  // racing-line curvature from the offset points (heading change over ±2 m)
  const w2 = Math.max(1, Math.round(2 / ds));
  for (let i = 0; i < n; i++) {
    const a = wrapI(pp, i - w2), b = wrapI(pp, i), c = wrapI(pp, i + w2);
    const ax = pp.X[a]! + pp.TY[a]! * pp.LINE[a]!, ay = pp.Y[a]! - pp.TX[a]! * pp.LINE[a]!;
    const bx = pp.X[b]! + pp.TY[b]! * pp.LINE[b]!, by = pp.Y[b]! - pp.TX[b]! * pp.LINE[b]!;
    const cx = pp.X[c]! + pp.TY[c]! * pp.LINE[c]!, cy = pp.Y[c]! - pp.TX[c]! * pp.LINE[c]!;
    const h1 = Math.atan2(by - ay, bx - ax), h2 = Math.atan2(cy - by, cx - bx);
    let dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    const len = 0.5 * (Math.hypot(bx - ax, by - ay) + Math.hypot(cx - bx, cy - by));
    LK[i] = len > 1e-6 ? dh / len : 0;
  }
  // boost-speed road ahead
  const cap = Math.round(500 / ds);
  let run = 0;
  for (let q = 2 * n - 1; q >= 0; q--) {
    const i = q % n;
    if (!pp.closed && q >= n) continue;
    if (Math.abs(KEFF[i]!) > K_BOOST) run = 0; else run = Math.min(cap, run + 1);
    if (q < n) STRAIGHT[i] = run * ds;
  }
  // corners: runs of same-sign curvature above K_CORNER, merged across short gaps
  const corners: Corner[] = [];
  let start = 0;
  if (pp.closed) { let best = 0; for (let i = 0; i < n; i++) if (Math.abs(pp.KAP[i]!) < Math.abs(pp.KAP[best]!)) best = i; start = best; }
  let cur: { s0: number; s1: number; dir: 1 | -1; turn: number; kMax: number; apex: number } | null = null;
  const flush = (): void => {
    if (!cur) return;
    if (cur.turn >= 0.3) {
      const gripCapTop = gripKappa(34);
      let vD = 99, kE = 0;
      for (let q = Math.floor(cur.s0 / ds); q <= Math.ceil(cur.s1 / ds); q++) {
        const i = wrapI(pp, q);
        if (pp.VLIM[i]! < vD) vD = pp.VLIM[i]!;
        const ke = Math.abs(pp.KAP[i]!) / (1 + R_BIAS * pp.HW[i]! * Math.abs(pp.KAP[i]!));
        if (ke > kE) kE = ke;
      }
      const vG = gripSpeedFor(kE * 1.04, BALANCE);
      corners.push({
        s0: cur.s0, s1: cur.s1, sApex: cur.apex, dir: cur.dir, turn: cur.turn, minR: 1 / Math.max(cur.kMax, 1e-6),
        needsDrift: kEffOf(cur.kMax, pp.HW[wrapI(pp, Math.round(cur.apex / ds))]!) > 0.9 * gripCapTop,
        vDrift: vD, gripRatio: Math.min(vG, 34) / Math.max(1, Math.min(vD, 34)),
      });
    }
    cur = null;
  };
  let gap = 0;
  for (let q = 0; q < n; q++) {
    const i = pp.closed ? (start + q) % n : q;
    const k = pp.KAP[i]!, ak = Math.abs(k);
    const sAbs = pp.closed ? (start + q) * ds : i * ds; // unwrapped along the scan
    const dir: 1 | -1 = k > 0 ? 1 : -1;
    if (ak > K_CORNER) {
      if (cur && dir === cur.dir && gap * ds < 10) { cur.s1 = sAbs; cur.turn += ak * ds; if (ak > cur.kMax) { cur.kMax = ak; cur.apex = sAbs; } }
      else { flush(); cur = { s0: sAbs, s1: sAbs, dir, turn: ak * ds, kMax: ak, apex: sAbs }; }
      gap = 0;
    } else if (cur) {
      gap++;
      if (gap * ds >= 10) flush();
    }
  }
  flush();
  // normalise s to the path range (the scan started mid-lap on circuits)
  const L = pp.length;
  for (const c of corners) {
    if (pp.closed) { c.s0 = mod(c.s0, L); c.s1 = mod(c.s1, L); c.sApex = mod(c.sApex, L); }
  }
  corners.sort((a, b) => a.s0 - b.s0);
  (pp as { corners: readonly Corner[] }).corners = corners;
  // CORNER[i]: the corner i lies in, else the next corner ahead
  if (corners.length) {
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      let best = -1, bestD = 1e18;
      for (let ci = 0; ci < corners.length; ci++) {
        const c = corners[ci]!;
        const inside = pp.closed ? inSpan(s, c.s0, c.s1, L) : s >= c.s0 && s <= c.s1;
        if (inside) { best = ci; bestD = -1; break; }
        let d = c.s0 - s;
        if (pp.closed && d < 0) d += L;
        if (d >= 0 && d < bestD) { bestD = d; best = ci; }
      }
      CORNER[i] = best;
    }
  }
  // racing-line weight. The drift controller was validated from a centreline approach with an outside bias,
  // and on these physics the grip line only pays off where the kart stays in grip: so the line is used through
  // sweepers (corners that need no drift, ±sweepPad m with ramps) and faded out around drift corners.
  const LINEW = pp.LINEW as Float64Array;
  const F = LINE_FADE;
  LINEW.fill(F.base);
  for (const c of corners) {
    if (c.needsDrift) continue;
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      let before = c.s0 - s, after = s - c.s1;
      if (pp.closed) { before = mod(before, L); after = mod(after, L); }
      const inside = pp.closed ? inSpan(s, c.s0, c.s1, L) : s >= c.s0 && s <= c.s1;
      let wgt = 0;
      if (inside) wgt = 1;
      else {
        if (before >= 0 && before < F.sweepPad + 30) wgt = Math.max(wgt, Math.min(1, (F.sweepPad + 30 - before) / 30));
        if (after >= 0 && after < F.sweepPad + 30) wgt = Math.max(wgt, Math.min(1, (F.sweepPad + 30 - after) / 30));
      }
      if (wgt > LINEW[i]!) LINEW[i] = wgt;
    }
  }
  for (const c of corners) {
    if (!c.needsDrift) continue;
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      let before = c.s0 - s, after = s - c.s1;
      if (pp.closed) { before = mod(before, L); after = mod(after, L); }
      const inside = pp.closed ? inSpan(s, c.s0, c.s1, L) : s >= c.s0 && s <= c.s1;
      let wgt = 1;
      if (inside) wgt = 0;
      else {
        if (before >= 0 && before < F.before0) wgt = Math.min(wgt, Math.max(0, (before - F.before1) / Math.max(1, F.before0 - F.before1)));
        if (after >= 0 && after < F.after1) wgt = Math.min(wgt, Math.max(0, (after - F.after0) / Math.max(1, F.after1 - F.after0)));
      }
      if (wgt < LINEW[i]!) LINEW[i] = wgt;
    }
  }
  // open non-main paths continue on their host at map.toS
  const meta = track.path(pp.index);
  if (!pp.closed && meta.map) (pp as { next: { path: number; s: number } | null }).next = { path: meta.map.host, s: meta.map.toS };
}

const mod = (x: number, L: number): number => x - L * Math.floor(x / L);
function inSpan(s: number, s0: number, s1: number, L: number): boolean {
  if (s1 >= s0) return s >= s0 && s <= s1;
  return s >= s0 || s <= s1; // wraps the line
}
const kEffOf = (k: number, hw: number): number => k / (1 + R_BIAS * hw * k);

/** The Balance archetype's grip law constants (enough for gripGain). */
const BALANCE = { yGrip: 1.55, gripV0: 4, gripV1: 33.5 } as KartParams;

/** Grip curvature capability 1/R at speed v for the Balance archetype (yGrip 1.55). */
function gripKappa(v: number): number {
  const q = v / 33.5;
  return 1.55 / (v + 4) / (1 + q * q);
}

/** Speed at which grip steering can just follow curvature k (bisection on gripGain(v)/v = k). */
export function gripSpeedFor(k: number, P: KartParams): number {
  if (k < 1e-5) return 99;
  let lo = 3, hi = 70;
  for (let it = 0; it < 24; it++) {
    const m = 0.5 * (lo + hi);
    if (gripGain(m, P) / m >= k) lo = m; else hi = m;
  }
  return lo;
}

/**
 * Grip-plan speed limit per sample for a kart (corners taken without drifting): the grip speed of the
 * effective curvature ahead, with braking distance at 0.8·aBrake (same law as the baked vLim).
 */
export function gripTable(plan: TrackPlan, P: KartParams): Float64Array[] {
  let t = plan.gripCache.get(P.yGrip);
  if (t) return t;
  t = plan.paths.map((pp) => {
    const n = pp.n, out = new Float64Array(n), vg = new Float64Array(n);
    for (let i = 0; i < n; i++) vg[i] = gripSpeedFor(Math.abs(pp.KEFF[i]!) * 1.04, P);
    const look = Math.round(90 / pp.ds), a2 = 2 * 0.8 * P.aBrake;
    for (let i = 0; i < n; i++) {
      let lim = 99;
      for (let k = 0; k <= look; k += 2) {
        const j = pp.closed ? (i + k) % n : Math.min(n - 1, i + k);
        const v0 = vg[j]!;
        if (v0 >= lim) continue;
        const vr = Math.sqrt(v0 * v0 + a2 * k * pp.ds);
        if (vr < lim) lim = vr;
      }
      out[i] = lim;
    }
    return out;
  });
  plan.gripCache.set(P.yGrip, t);
  return t;
}
