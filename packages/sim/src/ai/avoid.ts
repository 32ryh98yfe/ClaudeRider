// Lane choice: avoidance, slipstream and overtaking (14-ai §5). Re-planned every few ticks; the driver then
// slews its lateral offset toward the chosen lane at ≤ 3 m/s. Pure function of public world state + the
// bot's own predicted pose, so it runs identically on the server and in the offline worker.
import type { WorldState } from '../core/state.ts';
import type { BakedTrack } from '../track/BakedTrack.ts';
import type { EffectiveProfile } from './profiles.ts';
import type { HazardBlocks } from './hazards.ts';

/** Inputs the driver fills before each re-plan (a reused scratch object: no allocation). */
export interface LaneQuery {
  slot: number;
  /** Own predicted main-line progress, path, lateral u (+ right), along/lateral speed. */
  sMain: number; path: number; u: number; vS: number; vU: number;
  /** Our track frame at the kart: world x/z of the tangent and of the right vector. */
  tx: number; tz: number; rx: number; rz: number;
  /** Usable half-width at the pursuit point, absolute line offset there, current lane offset (rel. to line). */
  hw: number; lineAbs: number; laneOff: number;
  /** Seconds of prediction applied to every kart (lookahead). */
  la: number;
  /** Straight-road context for drafting and next-corner direction for overtakes (0 = none). */
  straight: boolean; nextCornerDir: number; nextCornerDist: number;
  /** 0..1 weight of the racing-line attraction (low right after the start so the grid fans in gently). */
  lineWeight: number;
  /** Draft burst active on this kart (pull out and pass). */
  draftActive: boolean;
  /** Extra wanted lateral target (item policy wish / pad), NaN = none. */
  wish: number;
  /** TTC horizon (s). */
  horizon: number;
  /** Track-hazard footprints ahead (blocked lateral intervals), or null. */
  blocks: HazardBlocks | null;
}

export interface LaneResult {
  /** The best lane still has contact inside the horizon: slew faster and be ready to lift. */
  urgent: boolean;
  /** Chosen lateral target relative to the line (m). */
  laneOff: number;
  /** Time to contact with the kart ahead in the chosen lane (s, Infinity = clear). */
  ttc: number;
  /** Closing speed on that kart (m/s). */
  closing: number;
  /** Following a kart for slipstream this re-plan. */
  drafting: boolean;
  /** A kart ahead blocked our current lane and we picked another one. */
  overtaking: boolean;
}

const OFFS = [-0.5, -0.25, 0, 0.25, 0.5] as const;
const N_CAND = 8; // 5 lanes + current lane + follow-draft + wish
const C_CUR = 5, C_DRAFT = 6, C_WISH = 7;
const candU = new Float64Array(N_CAND);
const candOk = new Uint8Array(N_CAND);
const LANE_RATE = 3.0;
const KART_W = 2.1;
/** Nose-to-tail distance (centre to centre, m) below which a kart ahead in the lane is treated as closing. */
const MIN_GAP = 5;
// per-kart predicted relative state, filled once per re-plan
const oDs = new Float64Array(8), oU = new Float64Array(8), oVU = new Float64Array(8), oClose = new Float64Array(8);
const oUse = new Uint8Array(8);

/** Chooses the lane with the lowest cost; writes `res`. */
export function planLane(w: Readonly<WorldState>, track: BakedTrack, q: Readonly<LaneQuery>, prof: Readonly<EffectiveProfile>, res: LaneResult): void {
  const L = track.lapLength, circuit = track.topology === 'circuit';
  const usable = Math.max(0.5, q.hw - 1.5);
  const lim = Math.max(0.3, q.hw - 1.3);
  const aggr = prof.aggression;
  const bump = aggr >= 0.8;
  const aggrScale = bump ? 1 - aggr : 1;
  const cur = clamp(q.lineAbs + q.laneOff, lim);
  const horizon = q.horizon;
  // ---- relative state of every other kart (predicted by the lookahead)
  let blockedCur = false, draftU = 0, draftGap = 1e9, anyNear = false;
  const nK = w.karts.length < 8 ? w.karts.length : 8;
  for (let j = 0; j < nK; j++) {
    oUse[j] = 0;
    if (j === q.slot) continue;
    const o = w.karts[j]!;
    // ghosted, finished and respawning karts are ignored (14-ai §5)
    if (!o.active || o.race.finishTick >= 0 || o.race.respawnPhase !== 0 || o.body.ghostTicks > 0) continue;
    if (o.race.loc.path !== q.path) continue;
    const ob = o.body;
    const ovS = ob.vx * q.tx + ob.vz * q.tz, ovU = ob.vx * q.rx + ob.vz * q.rz;
    const ds = gap(o.race.loc.sMain - q.sMain, L, circuit) + (ovS - q.vS) * q.la;
    // the forward cone grows with closing speed (a boosted kart covers 30 m in under 3 s)
    const reach = Math.min(60, Math.max(30, (q.vS - ovS) * 2.6));
    if (ds < -4 || ds > reach) continue;
    oUse[j] = 1; anyNear = true;
    oDs[j] = ds; oU[j] = o.race.loc.u + ovU * q.la; oVU[j] = ovU; oClose[j] = q.vS - ovS;
    const cEff = ds < MIN_GAP ? Math.max(oClose[j]!, 2) : oClose[j]!;
    oClose[j] = cEff;
    if (ds > 1.5 && cEff > 0.3 && Math.abs(oU[j]! - cur) < KART_W && (ds - 1.8) / cEff < horizon) blockedCur = true;
    if (prof.useDraft && q.straight && ds >= 5 && ds <= 20 && Math.abs(oU[j]! - q.u) < 3 && ds < draftGap) { draftGap = ds; draftU = oU[j]!; }
  }
  // ---- candidates
  for (let c = 0; c < OFFS.length; c++) { candU[c] = clamp(q.lineAbs + OFFS[c]! * usable, lim); candOk[c] = 1; }
  candU[C_CUR] = cur; candOk[C_CUR] = 1;
  candOk[C_DRAFT] = draftGap < 1e8 && !q.draftActive ? 1 : 0;
  if (candOk[C_DRAFT]) candU[C_DRAFT] = clamp(draftU, lim);
  candOk[C_WISH] = q.wish === q.wish ? 1 : 0;
  if (candOk[C_WISH]) candU[C_WISH] = clamp(q.wish, lim);
  const nBlk = q.blocks ? q.blocks.n : 0;
  if (!anyNear && !candOk[C_WISH] && nBlk === 0) {
    // clear road: back to the line (the driver's slew keeps it smooth)
    res.laneOff = 0; res.ttc = Infinity; res.closing = 0; res.drafting = false; res.overtaking = false; res.urgent = false;
    return;
  }

  let best = 2, bestCost = 1e18, bestTtc = Infinity, bestClosing = 0;
  for (let c = 0; c < N_CAND; c++) {
    if (!candOk[c]) continue;
    const cu = candU[c]!;
    let cost = 1.0 * q.lineWeight * Math.abs(cu - q.lineAbs) + 0.5 * Math.abs(cu - cur);
    let ttcMin = Infinity, closingAt = 0;
    for (let j = 0; j < nK; j++) {
      if (!oUse[j]) continue;
      const ds = oDs[j]!, closing = oClose[j]!, ou = oU[j]!;
      if (ds > 1.5) {
        // inside the minimum gap a kart counts as closing at ≥ 2 m/s: bots pull out and pass or lift, never tailgate
        const closeEff = ds < MIN_GAP ? Math.max(closing, 2) : closing;
        if (closeEff <= 0.3 && ds > 4) continue;
        const T = Math.max(0.05, (ds - 1.8) / Math.max(closeEff, 0.3));
        if (T > horizon * 2) continue;
        const du = cu - q.u;
        const tLane = Math.abs(du) / LANE_RATE;
        const myU = tLane > 1e-6 ? q.u + du * Math.min(1, T / tLane) : cu;
        const oU2 = ou + oVU[j]! * Math.min(T, 0.7);
        if (Math.abs(myU - oU2) < KART_W) {
          // never into a rival ahead at > 5 m/s closing speed, even for bump-happy personalities
          const sc = closing > 5 ? 1 : aggrScale;
          cost += 3.0 * sc / Math.max(T, 0.15);
          if (T < ttcMin) { ttcMin = T; closingAt = closing; }
        }
        if (c === C_DRAFT && q.draftActive) cost += 4;
      } else {
        // alongside: side-by-side contact
        const dl = Math.abs(cu - ou);
        if (dl < KART_W - 0.2) cost += bump ? 3.0 * aggrScale : 12;
        else if (bump && dl < KART_W + 0.6) cost -= 0.4 * (aggr - 0.7); // lean on a rival (bump)
      }
    }
    if (c === C_DRAFT) cost -= 1.5;   // slipstream follow
    if (c === C_WISH) cost -= 2.0;    // wanted target (pad / item box / policy wish)
    for (let b = 0; b < nBlk; b++) {
      // an active / telegraphing hazard at our arrival: that lane is out (14-ai §4.7, +50·hazard)
      const B = q.blocks!;
      if (cu > B.u0[b]! && cu < B.u1[b]!) cost += 50;
    }
    if (blockedCur && q.nextCornerDir !== 0 && q.nextCornerDist < 80) {
      // overtaking: prefer the inside of the next corner
      const inside = -cu * q.nextCornerDir / usable;
      if (inside > 0) cost -= 0.8 * inside;
    }
    if (cost < bestCost) { bestCost = cost; best = c; bestTtc = ttcMin; bestClosing = closingAt; }
  }
  res.laneOff = candU[best]! - q.lineAbs;
  res.ttc = bestTtc;
  res.closing = bestClosing;
  res.drafting = best === C_DRAFT;
  res.overtaking = blockedCur && best !== C_CUR && best !== C_DRAFT;
  res.urgent = blockedCur;
}

const clamp = (x: number, l: number): number => (x > l ? l : x < -l ? -l : x);
function gap(d: number, L: number, circuit: boolean): number {
  if (!circuit) return d;
  if (d > L / 2) return d - L;
  if (d < -L / 2) return d + L;
  return d;
}
