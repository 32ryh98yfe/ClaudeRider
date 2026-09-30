// Respawn tables (per path, baked after pass 1 so the probes run on the real collision data).
//   p{k}.rok  u8   1 = a kart may be placed here (ground under the centreline, not kill/warp/rail, clear of walls,
//                  and not inside a jump's danger zone)
//   p{k}.rto  i32  sample a kart whose last valid location is sample i is placed on (−1 = none: respawn in place)
// Jumps are why the target table exists. A kart that dies in a J gap has its last grounded location on the
// ramp or the lip; walking back from there put it on the ramp at v = 0, too slow for vMin, so it fell into the
// same gap forever. Now anything from the ramp foot to the landing window respawns past the gap (the landing
// side), and the run-up before the ramp respawns far enough back to reach vMin again.
import { SFLAG, type BakedTrack, type Contact, type GroundHit, type JumpBaked } from '@cr/sim';
import type { PathModel } from './paths.ts';

/** Conservative launch acceleration for the run-up rule: about half the slowest kart's a0, which covers the
 *  a0·(1 − (v/vT)²) roll-off, an uphill approach and a little steering. */
const RUNUP_ACCEL = 9;
/** Where on the landing side a kart is placed: this far into the landing window (capped at its middle). */
const LAND_IN = 5;
/** The local walk-back used everywhere else, in samples; it stays inside the locate window. */
const LOCAL_BACK = 15;

export interface RespawnContext {
  closed: boolean;       // the main line is a circuit
  lapLength: number;
  keyGates: readonly number[];
  jumps: readonly JumpBaked[];
}

export interface RespawnTables { ok: Uint8Array; to: Int32Array }

/** Run-up needed from rest to reach vMin, doubled (the brief's safety factor). */
export function runUp(vMin: number): number {
  return (2 * vMin * vMin) / (2 * RUNUP_ACCEL);
}

export function respawnTables(track: BakedTrack, p: PathModel, rc: RespawnContext): RespawnTables {
  const S = p.samples, n = S.length;
  const ok = new Uint8Array(n);
  const hit: GroundHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
  const cs: Contact[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0, flags: 0, tri: 0 }));
  S.forEach((s, i) => {
    if (s.flags & (SFLAG.NO_GROUND | SFLAG.KILL | SFLAG.WARP | SFLAG.RAIL)) return;
    if (!track.groundRay(s.x + s.ux, s.y + s.uy, s.z + s.uz, -s.ux, -s.uy, -s.uz, 2, hit)) return;
    if (hit.flags & 4) return;
    const r = Math.max(0.9, Math.min(3, s.w / 2 - 0.5));
    if (track.sphereWalls(hit.x + s.ux * 0.6, hit.y + s.uy * 0.6, hit.z + s.uz * 0.6, r, cs, 4) > 0) return;
    ok[i] = 1;
  });

  // ---- jump danger zones: [rampS − runUp, landS0 + in) never hosts a respawn
  const jumps = rc.jumps.filter((j) => j.path === p.index);
  const zone = jumps.map((j) => {
    const ramp = j.rampS ?? j.lipS;
    const land = j.landS0 + Math.min(LAND_IN, (j.landS1 - j.landS0) / 2);
    return { a: ramp - runUp(j.vMin), ramp, land };
  });
  const nSeg = p.closed ? n - 1 : n;
  const L = p.length;
  const inSpan = (s: number, a: number, b: number): boolean => {
    if (!p.closed) return s >= a && s < b;
    const d = (((s - a) % L) + L) % L;
    return d < b - a;
  };
  for (let i = 0; i < n; i++) for (const z of zone) if (inSpan(S[i]!.s, z.a, z.land)) ok[i] = 0;
  if (p.closed) ok[n - 1] = ok[0]!;

  // ---- progress gates a respawn may not jump over: the finish line either way, key gates forwards
  // (race.loc is set straight to the placed sample, so the lap logic never sees the move).
  const Lm = rc.lapLength;
  const wrapM = (d: number): number => (rc.closed ? (((d % Lm) + Lm) % Lm) : d);
  const crosses = (i: number, j: number): boolean => {
    const a = S[i]!.sMain, b = S[j]!.sMain;
    if (j === i) return false;
    const fwd = rc.closed ? wrapM(b - a) < Lm / 2 : b > a;
    if (fwd) {
      const d = rc.closed ? wrapM(b - a) : b - a;
      for (const g of rc.keyGates) { const e = wrapM(g - a); if (e > 0 && e <= d) return true; }
      if (rc.closed) return wrapM(Lm - a) <= d && wrapM(Lm - a) > 0;
      return a <= Lm && b > Lm;
    }
    if (!rc.closed) return false;
    const d = wrapM(a - b);
    return a < d;                       // passed back over sMain = 0
  };
  const idx = (i: number): number => (p.closed ? ((i % nSeg) + nSeg) % nSeg : i);
  const valid = (i: number): boolean => (p.closed || (i >= 0 && i < n)) && ok[idx(i)] === 1;
  /** first ok sample from `from` stepping by `dir`, at most `max` samples away, without crossing a gate */
  const seek = (i: number, from: number, dir: 1 | -1, max: number): number => {
    for (let k = 0; k <= max; k++) {
      const j = from + dir * k;
      if (!p.closed && (j < 0 || j >= n)) return -1;
      if (valid(j)) return crosses(i, idx(j)) ? -1 : idx(j);
    }
    return -1;
  };
  // samples are not quite uniform (the path length is split into whole steps), so search by s
  const firstAtOrAfter = (s: number): number => {
    const q = p.closed ? (((s % L) + L) % L) : Math.max(0, Math.min(L, s));
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S[mid]!.s < q - 1e-9) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const sampleAtOrAfter = (s: number): number => firstAtOrAfter(s);
  const sampleAtOrBefore = (s: number): number => {
    const q = p.closed ? (((s % L) + L) % L) : Math.max(0, Math.min(L, s));
    const j = firstAtOrAfter(q);
    return S[j]!.s > q + 1e-9 && j > 0 ? j - 1 : j;
  };

  const to = new Int32Array(n).fill(-1);
  const far = Math.ceil(300 / p.step);
  for (let i = 0; i < nSeg; i++) {
    const s = S[i]!.s;
    const z = zone.find((q) => inSpan(s, q.a, q.land));
    let j: number;
    if (z && inSpan(s, z.ramp, z.land)) {
      // on the ramp, over the gap, or short of the landing: land side first, else a full run-up back
      j = seek(i, sampleAtOrAfter(z.land), 1, far);
      if (j < 0) j = seek(i, sampleAtOrBefore(z.a), -1, far);
    } else if (z) {
      // run-up short of vMin: back to where a standing start clears the gap, else the land side
      j = seek(i, sampleAtOrBefore(z.a), -1, far);
      if (j < 0) j = seek(i, sampleAtOrAfter(z.land), 1, far);
    } else {
      j = seek(i, i, -1, LOCAL_BACK);
      if (j < 0) j = seek(i, i + 1, 1, LOCAL_BACK);
      if (j < 0) j = seek(i, i - LOCAL_BACK - 1, -1, far);
    }
    to[i] = j;
  }
  if (p.closed) to[n - 1] = to[0]!;
  else if (n > 0) to[n - 1] = n > 1 ? to[n - 2]! : -1;
  return { ok, to };
}
