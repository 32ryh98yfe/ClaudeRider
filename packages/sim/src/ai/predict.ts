// Self-prediction through the lookahead pipe (14-ai §1). A room applies a bot's frame `lookahead` ticks
// after it was decided, so the driver must steer the kart it WILL have, not the one it sees. A plain
// p + v·t extrapolation is fine on straights but lags badly in hairpins and at drift entry/exit, so this
// replays the bot's own pending frames through a flat-ground 2D copy of kartDynamics (no walls, contacts,
// slopes, zones or item effects): the gap-2 yaw law, lateral damping, slip cap, drift entry/exit, the
// longitudinal laws, and the M5 driving techniques of 15-driving-techniques §4 (tap edges, brake turn ×2,
// spin-out, cut, drag with η = 1 and the planar cap, no K16 while dragging, the post-boost bleed, STOP/R gears).
// Version 10 shares its continuous steering targets with the authority; the force integration remains planar.
// Every constant comes from KartParams. ~0.4 µs per frame; no allocation.
import type { KartState } from '../core/state.ts';
import { Edge } from '../core/input.ts';
import { Boost, Gear } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { decayF, smallCos, smallSin } from '../core/math.ts';
import { advanceDriftHandling, requestDrift, resetDriftHandling, steeringYaw, type DriftControl } from '../kart/handling.ts';
import { DECAY_POST_HOLD, DECAY_POST_REL, type KartParams } from '../kart/params.ts';

export class SelfPredictor {
  readonly n: number;
  private readonly control: DriftControl = { drift: 0, driftIntentTicks: 0, driftArmed: 0, driftDir: 1, driftEngagement: 0, driftTightness: 0, driftTarget: 0, driftRecovering: 0, pendingDriftDir: 0 };
  engagement = 0; tightness = 0; recovering = 0;
  private readonly qSteer: Float64Array;   // σ, + = left
  private readonly qHeld: Uint8Array;      // DRIFT held
  private readonly qThr: Uint8Array;
  private readonly qBrk: Uint8Array;
  private readonly qEdge: Uint8Array;      // TAP_L / TAP_R edges in the driver's own (un-mirrored) frame
  private readonly qBoost: Uint8Array;     // the driver's own booster request
  private head = 0; private count = 0;
  // predicted state at the apply tick (2D: X = x, Y = −z)
  px = 0.5; py = 0.5; hx = 0.5; hy = 0.5; vx = 0.5; vy = 0.5; yaw = 0.5;
  drift = 0; dir = 1; dTicks = 0; peak = 0.5; lock = 0;
  /** Instant-boost window ticks remaining at the apply tick (0 = none). */
  win = 0;
  /** True if a drift ends inside the pipe (the exit is already committed). */
  exited = false;
  // technique state at the apply tick (15-driving-techniques §3)
  /** Boost ticks (boostTicks + startTicks) and post-boost bleed ticks remaining. */
  boost = 0; post = 0; inst = 0; stun = 0;
  dragT = 0; streak = 0; gap = 255; counter = 0; brakeT = 0; gear = 1;
  /** sin β toward the drift side after the last pending frame (0 when not drifting). */
  sb = 0.5;
  /** Boosters left after the pending requests. */
  boosters = 0;
  /** A spin-out happens inside the pipe. */
  spun = false;

  constructor(lookahead: number) {
    this.n = lookahead;
    const m = Math.max(1, lookahead);
    this.qSteer = new Float64Array(m); this.qHeld = new Uint8Array(m); this.qThr = new Uint8Array(m); this.qBrk = new Uint8Array(m);
    this.qEdge = new Uint8Array(m); this.qBoost = new Uint8Array(m);
  }

  reset(): void { this.count = 0; this.head = 0; }

  /** Records the frame just decided (it applies `n` ticks from now), including direction and drift press edges. */
  push(steerLeft: number, held: boolean, thr: boolean, brk: boolean, edges = 0, boostReq = false): void {
    if (this.n === 0) return;
    const h = this.head;
    this.qSteer[h] = steerLeft; this.qHeld[h] = held ? 1 : 0; this.qThr[h] = thr ? 1 : 0; this.qBrk[h] = brk ? 1 : 0;
    this.qEdge[h] = edges & (Edge.TAP_L | Edge.TAP_R | Edge.DRIFT); this.qBoost[h] = boostReq ? 1 : 0;
    this.head = (h + 1) % this.n;
    if (this.count < this.n) this.count++;
  }

  /**
   * Predicts the kart state after the pending frames. `vMul` is the bot's speed cap multiplier; `grip` and `vSurf`
   * are the grip and speed multipliers of the surface under the kart now (held for the whole pipe).
   */
  run(k: Readonly<KartState>, P: KartParams, vMul: number, grip = 1, vSurf = 1): void {
    const b = k.body, d = k.drive, c = this.control;
    c.driftIntentTicks = d.driftIntentTicks; c.driftArmed = d.driftArmed; c.drift = d.drift; c.driftDir = d.driftDir; c.driftEngagement = d.driftEngagement;
    c.driftTightness = d.driftTightness; c.driftTarget = d.driftTarget; c.driftRecovering = d.driftRecovering; c.pendingDriftDir = d.pendingDriftDir;
    let hx = b.fx, hy = -b.fz;
    const hl = Math.sqrt(hx * hx + hy * hy) || 1; hx /= hl; hy /= hl;
    let px = b.px, py = -b.pz, vx = b.vx, vy = -b.vz, yaw = b.yawRate;
    let drift: number = d.drift, dir: number = d.driftDir, dT = d.driftTicks, peak = d.driftPeak, lock = d.reDriftLock;
    let win = d.instWindow, inst = d.instTicks, boostT = d.boostTicks, startT = d.startTicks, team = d.boostKind === Boost.TEAM;
    let stun = d.stunTicks, wheel = d.wheelspinTicks, draft = d.draftTicks, post = d.postTicks;
    let dragT = d.dragTicks, streak = d.tapStreak, gap = d.tapGap, counter = d.counterTicks, brakeT = d.brakeTicks, gear: number = d.gear;
    let boosters = d.boosters, teamBoosters = d.teamBoosters;
    let prevHeld = (d.prevHeld & 1) !== 0, prevThr = d.prevThrottle !== 0;
    // sin β of the current state: the answer when nothing is pending (lookahead 0) or no frame changes it
    let sbOut = 0;
    if (drift === 1) { const v0 = Math.sqrt(vx * vx + vy * vy); if (v0 > 0.1) sbOut = (-dir * (-vx * hy + vy * hx)) / v0; }
    this.exited = false; this.spun = false;
    const grounded = b.grounded === 1 || b.coyote > 0;
    const decAir = decayF(P.airYawDamp, DT);
    const steps = this.count;
    // the oldest pending frame is applied first
    let idx = (this.head - steps + this.n) % (this.n || 1);
    for (let q = 0; q < steps; q++) {
      const sig = this.qSteer[idx]!, rawHeld = this.qHeld[idx] === 1, thr = this.qThr[idx] === 1, brk = this.qBrk[idx] === 1;
      const edges = this.qEdge[idx]!, boostReq = this.qBoost[idx] === 1;
      const driftPress = (edges & Edge.DRIFT) !== 0, held = rawHeld || driftPress;
      idx = (idx + 1) % this.n;
      // ---- timers (phase-3 decrement); the bleed arms on a natural boost expiry (§4.1)
      if (c.driftIntentTicks > 0) c.driftIntentTicks--;
      const wasBoost = boostT > 0 || startT > 0;
      if (boostT > 0) { boostT--; if (boostT === 0) team = false; }
      if (startT > 0) startT--;
      if (inst > 0) inst--;
      if (win > 0) win--;
      if (stun > 0) stun--;
      if (lock > 0) lock--;
      if (wheel > 0) wheel--;
      if (draft > 0) draft--;
      if (post > 0) post--;
      if (wasBoost && boostT === 0 && startT === 0) post = P.postTicks;
      const wallStun = stun > 0;
      const thrEdge = thr && !prevThr;
      const driftEdge = driftPress || (held && !prevHeld);
      prevHeld = rawHeld; prevThr = thr;
      if (!grounded) {
        // airborne: yaw damping, the nose eases toward the flight direction, no drag, no cut counter
        yaw *= decAir;
        { const s = smallSin(yaw * DT), c = smallCos(yaw * DT), nx = hx * c - hy * s, ny = hy * c + hx * s, nl = Math.sqrt(nx * nx + ny * ny) || 1; hx = nx / nl; hy = ny / nl; }
        const sp = Math.sqrt(vx * vx + vy * vy);
        if (sp > 1) { const e = 1 - decayF(4, DT); let nx = hx + (vx / sp - hx) * e, ny = hy + (vy / sp - hy) * e; const nl = Math.sqrt(nx * nx + ny * ny) || 1; nx /= nl; ny /= nl; hx = nx; hy = ny; }
        if (win > 0 && thrEdge) { inst = P.instTicks; win = 0; }
        // K13: a requested booster fires when fewer than chainTicks of boost remain (team boosters first)
        if (boostReq && boostT < P.chainTicks && boosters + teamBoosters > 0) {
          if (teamBoosters > 0) { teamBoosters--; boostT += P.teamBoostTicks; team = true; } else { boosters--; boostT += P.tBoostTicks; team = false; }
        }
        dragT = 0; streak = 0; gap = 255; counter = 0;
        if (post > 0 && (boostT > 0 || startT > 0 || drift === 1 || inst > 0)) post = 0;
        px += vx * DT; py += vy * DT;
        continue;
      }
      let u = vx * hx + vy * hy;
      brakeT = brk ? (brakeT < 255 ? brakeT + 1 : 255) : 0;
      // ---- K2: shared continuous targets; a held Shift never creates a new entry by itself.
      const directionEdge = edges & (Edge.TAP_L | Edge.TAP_R);
      const driftSteer = directionEdge === Edge.TAP_L ? 1 : directionEdge === Edge.TAP_R ? -1 : sig;
      let entered = false;
      if (c.drift === 0 && c.driftArmed && held && sig !== 0 && u >= P.driftMinSpeed && !wallStun && !brk) entered = requestDrift(c, sig, true) === 1;
      if (!held) c.driftArmed = 0;
      if (c.drift === 0 && c.pendingDriftDir !== 0 && u >= P.driftMinSpeed && !wallStun && !brk) entered = requestDrift(c, c.pendingDriftDir, true) === 1;
      if (driftEdge) entered = requestDrift(c, driftSteer, u >= P.driftMinSpeed && !wallStun && !brk) === 1 || entered;
      if (entered) { dT = 0; peak = 0; lock = 0; dragT = 0; streak = 0; gap = 255; counter = 0; brakeT = brk ? 1 : 0; post = 0; }
      advanceDriftHandling(c, sig, held, sig, brk);
      drift = c.drift; dir = c.driftDir;
      // ---- K3 directional tap targets; ordinary brake inputs recover instead of forcing a spin.
      if (drift === 1 && dragT > 0) {
        if (gap < 255) gap++;
        if ((edges & (dir > 0 ? Edge.TAP_L : Edge.TAP_R)) !== 0) {
          if (gap > P.tapMaxGap) streak = 1;
          else if (gap >= P.tapMinGap) streak = Math.min(P.tapStreakMax, streak + 1);
          else streak = 0;
          gap = 0;
          if (streak > 0) c.driftTarget = Math.min(1, c.driftTarget + 0.08);
        }
      }
      // ---- K4 yaw target and lag, K5 heading rotation
      u = vx * hx + vy * hy;
      const sIn = sig * dir;
      yaw = steeringYaw(c, u, sig, yaw, P);
      { const a = yaw * DT, s = smallSin(a), co = smallCos(a), nx = hx * co - hy * s, ny = hy * co + hx * s, nl = Math.sqrt(nx * nx + ny * ny) || 1; hx = nx / nl; hy = ny / nl; }
      // ---- K6 decomposition
      u = vx * hx + vy * hy;
      let w = -vx * hy + vy * hx;
      let v = Math.sqrt(u * u + w * w);
      // ---- K7b cut and drag
      const boosting = boostT > 0 || startT > 0;
      let cut = false;
      if (drift === 1) {
        counter = c.driftRecovering === 2 ? Math.min(255, counter + 1) : 0;
        const steerOk = sIn > -P.dragNeutral && (sIn < P.dragNeutral || (streak > 0 && gap <= P.tapGrace));
        const ok = !cut && boosting && thr && !brk && steerOk;
        const sb7 = v > 0.1 ? (-dir * w) / v : 0;
        if (ok && dragT === 0 && sb7 >= P.dragEnterLo && sb7 <= P.dragEnterHi) { dragT = 1; streak = 0; gap = 255; }
        else if (ok && dragT > 0 && sb7 >= P.dragExitLo && sb7 <= P.dragExitHi) { if (dragT < 255) dragT++; }
        else { dragT = 0; streak = 0; gap = 255; }
      } else counter = 0;
      const dragging = dragT > 0;
      // ---- K8 lateral damping with momentum retention
      let kL: number, eta: number;
      if (drift === 0) { kL = P.kLatGrip; eta = P.etaGrip; }
      else {
        eta = dragging ? P.etaDrag : P.etaDrift;
        const sL = dragging && streak > 0 && gap <= P.tapGrace && sIn > P.dragNeutral ? P.dragNeutral : sIn; // §4.6, as in K4
        if (sL >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sL - 0.3) / 0.7);
        else if (sL > -0.3) kL = P.kLatNeutral;
        else kL = P.kLatNeutral + (P.kLatCounter - P.kLatNeutral) * ((-sL - 0.3) / 0.7);
        kL = P.kLatGrip + (kL - P.kLatGrip) * c.driftEngagement;
        eta = P.etaGrip + (eta - P.etaGrip) * c.driftEngagement;
      }
      kL *= grip;
      const w2 = w * decayF(kL, DT);
      const vRaw = Math.sqrt(u * u + w2 * w2);
      if (vRaw > 1e-6) { const f = (vRaw + eta * (v - vRaw)) / vRaw; u *= f; w = w2 * f; } else w = w2;
      v = Math.sqrt(u * u + w * w);
      cut = c.driftRecovering === 2 && c.driftEngagement === 0 && Math.abs(w) <= P.exitSin * v;
      // ---- K9 slip cap, K11 drift bookkeeping and exit (the instant window opens on a qualifying exit)
      let sb = 0;
      if (drift === 1) {
        const sm = P.sinBetaMax * v; if (w > sm || w < -sm) { w = w > 0 ? sm : -sm; u = Math.sqrt(Math.max(0, v * v - w * w)); }
        sb = v > 0.1 ? (-dir * w) / v : 0;
        dT++; if (sb > peak) peak = sb;
        if ((dT >= P.exitMinTicks && c.driftEngagement === 0 && Math.abs(sb) < P.exitSin) || u < 5 || cut) {
          if (dT >= P.instMinDriftTicks && peak >= P.instMinSlip) win = P.instWindowTicks;
          drift = 0; lock = P.reDriftTicks; dir = 1; dT = 0; peak = 0; this.exited = true;
          c.drift = 0; c.driftDir = 1; { const pending = c.pendingDriftDir; resetDriftHandling(c); c.pendingDriftDir = pending; }
          dragT = 0; streak = 0; gap = 255; counter = 0; brakeT = 0;
        }
      }
      sbOut = drift === 1 ? sb : 0;
      // ---- K12 instant boost, K13 boosters
      if (win > 0 && thrEdge) { inst = P.instTicks; win = 0; }
      // K13: a requested booster fires when fewer than chainTicks of boost remain (team boosters first)
      if (boostReq && boostT < P.chainTicks && boosters + teamBoosters > 0) {
        if (teamBoosters > 0) { teamBoosters--; boostT += P.teamBoostTicks; team = true; } else { boosters--; boostT += P.tBoostTicks; team = false; }
      }
      // ---- K14 target speed
      let vT: number, boostLaw = true, cap = P.aBoostMax;
      if (boostT > 0) vT = team ? P.vTeam : P.vBoost;
      else if (startT > 0) { vT = P.vBoost * P.startCapMul; cap = P.aStartMax; }
      else { vT = draft > 0 ? P.vDraft : P.vGrip; boostLaw = false; }
      vT *= vSurf * vMul;
      const instOn = inst > 0 && !boostLaw && u < P.vInst * vMul;
      if (post > 0 && (boostLaw || drift === 1 || inst > 0)) post = 0;
      // ---- K15a gears (flat ground: the zero-lock always holds)
      let reverse = false;
      if (thr) gear = Gear.D;
      else if (brk) {
        if (u > 0.5) gear = Gear.D;
        else if (gear !== Gear.R) {
          // the transition tick is ↓ tick 1 at STOP; R after revEngageTicks of them, however STOP was reached
          if (gear !== Gear.STOP) { gear = Gear.STOP; brakeT = 1; }
          else if (brakeT > P.revEngageTicks) gear = Gear.R;
        }
        reverse = gear === Gear.R;
      } else if (gear === Gear.D || (gear === Gear.STOP && u * u + w * w > 0.25)) gear = Gear.N;
      if (gear === Gear.STOP) { u = 0; w = 0; }
      else {
        // ---- K15 longitudinal laws (throttle 15: τ = 1)
        const thrA = wallStun ? 0 : thr ? 1 : 0;
        let a: number;
        if (thrA) {
          if (u < vT) {
            if (boostLaw) {
              a = P.kBoost * (vT - u); if (a > cap) a = cap;
              const base = P.a0 * (1 - u / P.vGrip); if (a < base) a = base;
            } else {
              const qq = u / vT;
              a = P.a0 * (draft > 0 ? P.draftAccelMul : 1) * (1 - qq * qq);
              if (drift === 1 && a > P.aDrift) a = P.aDrift;
            }
            if (instOn && a < P.aInst) a = P.aInst;
          } else { a = -P.kOver * (u - vT); if (instOn) a = P.aInst; }
          if (wheel > 0) a *= 0.3;
        } else {
          a = u >= 0 ? -P.aCoast : P.aCoast;
          if (u > vT) a -= P.kOver * (u - vT);
        }
        if (brk) {
          if (reverse) { const r = u < 0 ? -u / P.vReverse : 0; a = -P.aReverse * (1 - r * r); }
          else if (u > 0) a = -(drift === 1 ? P.aBrakeDrift : P.aBrake);
          else if (thr) a = u < 0 ? P.aBrake : 0;
        }
        let uN: number;
        if (dragT > 0 && thrA && boostLaw) {
          // drag law: injection past vBoost, capped on planar |v| (raised by the tap streak)
          const aI = P.aDrag * (streak > 0 && gap < P.tapTicks ? P.tapAccelMul : 1);
          const vCap = P.vBoost * (P.dragCapMul + P.tapCapStep * streak) * vSurf * vMul;
          const vp = Math.sqrt(u * u + w * w);
          if (vp > vCap) uN = u - P.kOver * (vp - vCap) * DT;
          else {
            uN = u + (a > aI ? a : aI) * DT;
            if (uN * uN + w * w > vCap * vCap) { const room = vCap * vCap - w * w; uN = room > u * u ? Math.sqrt(room) : u; }
          }
        } else if (post > 0 && u > 0) {
          // post-boost bleed toward the non-boost target (↑ held) or toward 0 (released)
          if (thrA) uN = u > vT ? vT + (u - vT) * DECAY_POST_HOLD : u + a * DT;
          else {
            let du = (vT - u) * (1 - DECAY_POST_HOLD);
            const dz = -u * (1 - DECAY_POST_REL);
            if (dz < du) du = dz;
            uN = u + du;
          }
          if (brk) { const ub = u + a * DT; if (ub < uN) uN = ub; }
        } else uN = u + a * DT;
        if (thrA && !brk && uN > u) {
          const motorCap = instOn ? Math.max(vT, P.vInst * vMul) : vT;
          uN = Math.max(u, Math.min(uN, Math.sqrt(Math.max(0, motorCap * motorCap - w * w))));
        }
        if (!reverse) {
          if ((thrA === 0 || brk) && u >= 0 && uN < 0) uN = 0;
          else if ((thrA === 0 || brk) && u < 0 && uN > 0) uN = 0;
        }
        u = uN;
        if (u === 0 && !thr && !brk && w * w <= 0.25) { gear = Gear.STOP; w = 0; } // at rest: planar speed too
      }
      // ---- K16 drift drag (not while dragging), spin-out speed
      if (drift === 1 && sb > 0 && dragT === 0) { let f = 1 - P.cBeta * sb * sb * DT; if (f < 0) f = 0; u *= f; w *= f; }
      vx = u * hx - w * hy; vy = u * hy + w * hx;
      px += vx * DT; py += vy * DT;
    }
    this.px = px; this.py = py; this.hx = hx; this.hy = hy; this.vx = vx; this.vy = vy; this.yaw = yaw;
    this.drift = drift; this.dir = dir; this.dTicks = dT; this.peak = peak; this.lock = lock; this.win = win;
    this.boost = boostT + startT; this.post = post; this.inst = inst; this.stun = stun;
    this.dragT = dragT; this.streak = streak; this.gap = gap; this.counter = counter; this.brakeT = brakeT; this.gear = gear;
    this.engagement = c.driftEngagement; this.tightness = c.driftTightness; this.recovering = c.driftRecovering;
    this.sb = sbOut; this.boosters = boosters + teamBoosters;
  }
}
