// Kart driving dynamics — 3D port of the validated gap-2 model (docs/research/sim-prototype.md), step by step as
// 10-sim-spec §5.1–§7 (K0–K19). Integrated ONCE per tick in the kart's tangent frame (forward f, left l = n × f,
// up n); position is integrated by motion.ts. Inside the sim, yaw rate and steer are + = LEFT (CCW seen from +n);
// InputFrame.steer is + = right, so the latch negates it.
//
// Timer convention: countdowns are decremented here, at the start of phase 3, and a countdown is active while it
// is > 0 after that decrement. A value set later in the tick (phases 4–7) or earlier (phases 1–2) is therefore
// written N + 1 to cover N dynamics phases (10-sim-spec §1.3).
//
// Driving techniques (M5) follow docs/design/15-driving-techniques.md §4, which supersedes 10-sim-spec for them:
// post-boost bleed, brake turn / spin-out, tap boost, cut, reverse gauge, drag and gears. Their steps are marked
// "§4.n" below. Version 10 replaces impulse steering with continuous grip/drift engagement and curvature targets.
import type { InputFrame } from '../core/input.ts';
import { Held, Edge, driftRequestAt, driftRequestCount } from '../core/input.ts';
import { Attach, Boost, Gear, type GearState, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { decayF, smallCos, smallSin } from '../core/math.ts';
import type { KartMods, StepContext } from '../api.ts';
import type { SurfaceDef } from '@cr/content';
import { DECAY_POST_HOLD, DECAY_POST_REL, type KartParams } from './params.ts';
import { evKey } from './evkey.ts';
import { clearDriftTech, endDrag, resetTech, setGear } from './tech.ts';
import { addGauge, GaugeSrc } from './gauge.ts';
import { conveyorMul, effectiveSurface, gravityFor } from './zones.ts';
import { railDynamics } from './rail.ts';
import { hasZones } from './trackinfo.ts';
import { advanceDriftHandling, requestDrift, steeringYaw } from './handling.ts';

const SURF_DEFAULT: SurfaceDef = { id: 'asphalt', code: 1, grip: 1, vMul: 1, dragMul: 1 };

/** Speed cap after a manual reset (R), as a fraction of vGrip, while KartRace.slowTicks > 0 [P]. */
export const SLOW_CAP = 0.85;

export interface DynamicsIn { gaugeOn: boolean; infinite: boolean; itemMode: boolean; instantAllowed: boolean; racing: boolean; teamSize: number }

/** Rotates the kart forward vector around its up by a small angle a (proto2d rotH). */
function rotateForward(k: KartState, a: number): void {
  const b = k.body;
  const s = smallSin(a), c = smallCos(a);
  const lx = b.ny * b.fz - b.nz * b.fy, ly = b.nz * b.fx - b.nx * b.fz, lz = b.nx * b.fy - b.ny * b.fx;
  let fx = b.fx * c + lx * s, fy = b.fy * c + ly * s, fz = b.fz * c + lz * s;
  const n = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  fx /= n; fy /= n; fz /= n;
  b.fx = fx; b.fy = fy; b.fz = fz;
}

/**
 * Ends a drift: lockout, canonical drift fields (10-sim-spec §15.2) and the driftEnd event. The drag ends and the
 * technique fields reset with it (15-driving-techniques §4.7).
 */
export function endDrift(w: WorldState, k: KartState, P: KartParams, ctx: StepContext): void {
  const d = k.drive;
  if (d.drift === 0) return;
  d.drift = 0; d.reDriftLock = P.reDriftTicks;
  d.driftDir = 1; d.driftTicks = 0; d.driftPeak = 0;
  ctx.events.push({ t: 'driftEnd', kart: k.slot, tick: w.tick, key: evKey(w.tick, 4, k.slot) });
  const pending = d.pendingDriftDir;
  clearDriftTech(w, k, ctx);
  d.pendingDriftDir = pending;
}

/** A valid tap's key may stay down this long: in-direction steer is tolerated by the drag and steers like neutral (§4.4–§4.6). */
const inTapGrace = (d: Readonly<KartState['drive']>, P: KartParams): boolean => d.tapStreak > 0 && d.tapGap <= P.tapGrace;

/** Bonus-charge multiplier: Infinite Boost doubles start, instant and draft charges (ADR-008). */
const bonusMul = (opt: Readonly<DynamicsIn>): number => (opt.infinite ? 2 : 1);

/**
 * Advances drive state and velocity for one tick. `surfDef` is the triangle surface under the kart (zones may
 * override it); `mods` are the aggregated effect modifiers.
 */
export function kartDynamics(w: WorldState, k: KartState, inp: Readonly<InputFrame>, P: KartParams, ctx: StepContext, mods: Readonly<KartMods>, surfDef: SurfaceDef | undefined, opt: DynamicsIn): void {
  const b = k.body, d = k.drive, ev = ctx.events, tick = w.tick, T = ctx.track;
  const zoned = hasZones(T);
  const surf = zoned ? effectiveSurface(k, T, ctx.content.surfaceByCode, surfDef ?? SURF_DEFAULT) : (surfDef ?? SURF_DEFAULT);
  if (zoned) gravityFor(T, k.race.loc, ctx.scratch.grav);

  // ---------------------------------------------------------------- timers (phase-3 decrement, see header)
  if (d.driftIntentTicks > 0) d.driftIntentTicks--;
  const wasBoost = d.boostTicks > 0 || d.startTicks > 0;
  if (d.boostTicks > 0) { d.boostTicks--; if (d.boostTicks === 0) { ev.push({ t: 'boostEnd', kart: k.slot, kind: d.boostKind, tick, key: evKey(tick, 1, k.slot) }); d.boostKind = Boost.NONE; } }
  if (d.startTicks > 0) d.startTicks--;
  if (d.instTicks > 0) d.instTicks--;
  if (d.instWindow > 0) d.instWindow--;
  if (d.stunTicks > 0) d.stunTicks--;
  if (d.reDriftLock > 0) d.reDriftLock--;
  if (d.wheelspinTicks > 0) d.wheelspinTicks--;
  if (d.draftTicks > 0) { d.draftTicks--; if (d.draftTicks === 0) ev.push({ t: 'draft', kart: k.slot, on: false, tick, key: evKey(tick, 31, k.slot) }); }
  if (!b.grounded && b.coyote > 0) b.coyote--;
  if (k.race.slowTicks > 0 && k.race.respawnPhase === 0) k.race.slowTicks--;
  if (d.postTicks > 0) d.postTicks--;
  // §4.1 post-boost bleed: armed only when the last running boost expires here. Every cancellation (hard wall hit,
  // hard CC, respawn, start-boost throttle release, spin-out) zeroes the boost timers elsewhere, and postTicks too.
  if (wasBoost && d.boostTicks === 0 && d.startTicks === 0) d.postTicks = P.postTicks;

  // ---------------------------------------------------------------- phase 1: input latch (§5.1)
  const locked = mods.noControl || k.race.respawnPhase !== 0;
  const wallStun = d.stunTicks > 0;
  const thrIn = !locked && inp.throttle > 0 ? 1 : 0;
  const tau = thrIn ? inp.throttle / 15 : 0;
  const thr = wallStun ? 0 : thrIn;                  // throttle for acceleration (proto: thr = stunned ? 0 : thrIn)
  const thrEdge = inp.throttle > 0 && d.prevThrottle === 0 && !locked;
  // Explicit presses survive a key down/up between two simulation samples and a release/re-press while the
  // previous sampled held bit was still high. A simultaneous held transition and edge is still one impulse.
  const driftPress = !locked && (inp.edges & Edge.DRIFT) !== 0;
  const driftHeld = !locked && ((inp.held & Held.DRIFT) !== 0 || driftPress);
  const driftEdge = driftPress || (driftHeld && (d.prevHeld & Held.DRIFT) === 0);
  const useEdge = !locked && (inp.edges & Edge.USE_ITEM) !== 0;
  const autoFire = !locked && (inp.held & Held.ITEM) !== 0;
  let steer = -inp.steer / 127;
  if (mods.steerInvert) steer = -steer;
  steer *= mods.steerMul;
  if (locked) steer = 0;
  steer = steer > 1 ? 1 : steer < -1 ? -1 : steer;
  const brk = !locked && inp.brake > 0;

  // rails: kinematic attachment replaces driving dynamics (§13.3)
  if (b.attachKind === Attach.RAIL) {
    railDynamics(w, k, P, ctx, opt);
    latch(k, inp);
    return;
  }
  if (b.attachKind === Attach.WARP) { latch(k, inp); return; } // frozen at the gate while in transit (§13.4)

  // ---------------------------------------------------------------- K0 frame hygiene
  {
    let nl = Math.sqrt(b.nx * b.nx + b.ny * b.ny + b.nz * b.nz) || 1;
    b.nx /= nl; b.ny /= nl; b.nz /= nl;
    const fn = b.fx * b.nx + b.fy * b.ny + b.fz * b.nz;
    let fx = b.fx - fn * b.nx, fy = b.fy - fn * b.ny, fz = b.fz - fn * b.nz;
    nl = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (nl > 1e-9) { fx /= nl; fy /= nl; fz /= nl; b.fx = fx; b.fy = fy; b.fz = fz; }
  }

  const control = b.grounded === 1 || b.coyote > 0;
  const g = ctx.scratch.grav;
  const gm = bonusMul(opt);
  const nx = b.nx, ny = b.ny, nz = b.nz;

  if (control) {
    let fx = b.fx, fy = b.fy, fz = b.fz;
    let u = b.vx * fx + b.vy * fy + b.vz * fz;

    // §4.2 consecutive brake ticks (brake turn, spin-out, reverse engage)
    d.brakeTicks = brk ? (d.brakeTicks < 255 ? d.brakeTicks + 1 : 255) : 0;

    // K2: consume ordered physical presses. Held Shift sustains an existing drift but never re-enters one.
    const directionEdge = inp.edges & (Edge.TAP_L | Edge.TAP_R);
    const intent = inp.steerIntent !== 0 ? -inp.steerIntent : -inp.steer / 127;
    const pressIntent = driftEdge && (directionEdge === Edge.TAP_L || directionEdge === Edge.TAP_R) ? (directionEdge === Edge.TAP_L ? 1 : -1) : intent;
    const inv = mods.steerInvert ? -1 : 1;
    const canEnter = u >= P.driftMinSpeed && !wallStun && !brk;
    let entered = false, repeated = 0;
    if (d.drift === 0 && d.driftArmed && driftHeld && intent !== 0 && canEnter) entered = requestDrift(d, intent * inv, true) === 1;
    if (!driftHeld) d.driftArmed = 0;
    if (d.drift === 0 && d.pendingDriftDir !== 0 && canEnter) {
      entered = requestDrift(d, d.pendingDriftDir, true) === 1;
    }
    const requests = driftRequestCount(inp.driftRequests || 0);
    const count = locked ? 0 : requests || (driftEdge ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const requested = requests > 0 ? -driftRequestAt(inp.driftRequests, i) : 0;
      const action = requestDrift(d, (requested || pressIntent) * inv, canEnter);
      entered ||= action === 1;
      if (action === 2) repeated++;
    }
    if (entered) {
      d.driftTicks = 0; d.driftPeak = 0; d.reDriftLock = 0;
      resetTech(d); d.brakeTicks = brk ? 1 : 0; d.postTicks = 0; k.stats.drifts++;
      ev.push({ t: 'driftStart', kart: k.slot, tick, key: evKey(tick, 2, k.slot) });
    }
    if (repeated > 0) ev.push({ t: 'doubleDrift', kart: k.slot, tick, key: evKey(tick, 3, k.slot) });
    advanceDriftHandling(d, steer, driftHeld, intent * inv, brk);
    fx = b.fx; fy = b.fy; fz = b.fz;
    u = b.vx * fx + b.vy * fy + b.vz * fz;

    // K3: directional tap bonuses affect the smooth target. Ordinary braking never injects yaw or stun.
    if (d.drift === 1) {
    if (d.dragTicks > 0) {
      if (d.tapGap < 255) d.tapGap++;
      // the corner-direction key; Mirror Mode swaps the keys, so it swaps the edge bits too
      const inv = mods.steerInvert;
      const tapIn = d.driftDir > 0 ? (inv ? Edge.TAP_R : Edge.TAP_L) : (inv ? Edge.TAP_L : Edge.TAP_R);
      if (!locked && (inp.edges & tapIn) !== 0) {
        const gap = d.tapGap;
        if (gap > P.tapMaxGap) d.tapStreak = 1;
        else if (gap >= P.tapMinGap) d.tapStreak = d.tapStreak < P.tapStreakMax ? d.tapStreak + 1 : P.tapStreakMax;
        else d.tapStreak = 0; // mashing faster than tapMinGap is not a tap
        d.tapGap = 0;
        if (d.tapStreak > 0) {
          d.driftTarget = Math.min(1, d.driftTarget + 0.08);
          ev.push({ t: 'tapBoost', kart: k.slot, streak: d.tapStreak, tick, key: evKey(tick, 11, k.slot, d.tapStreak) });
        }
      }
    }
    }

    // -------------------------------------------------------------- K4 yaw target and lag
    const sIn = steer * d.driftDir;
    b.yawRate = steeringYaw(d, u, steer, b.yawRate, P);

    // K5: all heading changes are the integral of the bounded yaw rate.
    rotateForward(k, b.yawRate * DT);
    fx = b.fx; fy = b.fy; fz = b.fz;
    const lx = ny * fz - nz * fy, ly = nz * fx - nx * fz, lz = nx * fy - ny * fx;

    // -------------------------------------------------------------- K6 decomposition
    u = b.vx * fx + b.vy * fy + b.vz * fz;
    let wl = b.vx * lx + b.vy * ly + b.vz * lz;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;

    // -------------------------------------------------------------- K7 slope gravity (tangential part; the ground takes the rest)
    let gt2 = Infinity; // squared tangential gravity (zero-lock grade test); no lock off the ground
    if (b.grounded) {
      const gn = g.x * nx + g.y * ny + g.z * nz;
      const gtx = g.x - gn * nx, gty = g.y - gn * ny, gtz = g.z - gn * nz;
      u += (gtx * fx + gty * fy + gtz * fz) * DT;
      wl += (gtx * lx + gty * ly + gtz * lz) * DT;
      gt2 = gtx * gtx + gty * gty + gtz * gtz;
    }
    let v = Math.sqrt(u * u + wl * wl);

    // -------------------------------------------------------------- K7b cut and drag (§4.5)
    const boosting = d.boostTicks > 0 || d.startTicks > 0;
    let cut = false;
    if (d.drift === 1) {
      d.counterTicks = d.driftRecovering === 2 ? Math.min(255, d.counterTicks + 1) : 0;
      // drag: boosting, ↑, no brake, on the ground, steering neutral (or the key of a valid tap still held)
      const steerOk = sIn > -P.dragNeutral && (sIn < P.dragNeutral || inTapGrace(d, P));
      const ok = !cut && boosting && thrIn === 1 && !brk && b.grounded === 1 && steerOk;
      const sb7 = v > 0.1 ? (-d.driftDir * wl) / v : 0;
      if (ok && d.dragTicks === 0 && sb7 >= P.dragEnterLo && sb7 <= P.dragEnterHi) {
        d.dragTicks = 1; d.tapStreak = 0; d.tapGap = 255;
        ev.push({ t: 'drag', kart: k.slot, on: true, tick, key: evKey(tick, 10, k.slot, 1) });
      } else if (ok && d.dragTicks > 0 && sb7 >= P.dragExitLo && sb7 <= P.dragExitHi) {
        if (d.dragTicks < 255) d.dragTicks++;
      } else endDrag(w, k, ctx);
    } else d.counterTicks = 0;
    const dragging = d.dragTicks > 0;

    // -------------------------------------------------------------- K8 lateral damping with momentum retention
    let kL: number, eta: number;
    if (d.drift === 0) { kL = P.kLatGrip; eta = P.etaGrip; }
    else {
      eta = dragging ? P.etaDrag : P.etaDrift; // §4.6: the drag turns the scrubbed lateral speed into forward speed
      // §4.6: a tap key held inside the grace selects the neutral band, as in K4
      const sL = dragging && inTapGrace(d, P) && sIn > P.dragNeutral ? P.dragNeutral : sIn;
      if (sL >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sL - 0.3) / 0.7);
      else if (sL > -0.3) kL = P.kLatNeutral;
      else kL = P.kLatNeutral + (P.kLatCounter - P.kLatNeutral) * ((-sL - 0.3) / 0.7);
      kL = P.kLatGrip + (kL - P.kLatGrip) * d.driftEngagement;
      eta = P.etaGrip + (eta - P.etaGrip) * d.driftEngagement;
    }
    kL *= surf.grip;
    const w2 = wl * decayF(kL, DT);
    const vRaw = Math.sqrt(u * u + w2 * w2);
    if (vRaw > 1e-6) { const f = (vRaw + eta * (v - vRaw)) / vRaw; u *= f; wl = w2 * f; } else wl = w2;
    v = Math.sqrt(u * u + wl * wl);

    // Recovery finishes with the observed velocity intact; no sideways velocity is deleted at the transition.
    cut = d.driftRecovering === 2 && d.driftEngagement === 0 && Math.abs(wl) <= P.exitSin * v;
    if (cut) ev.push({ t: 'cut', kart: k.slot, tick, key: evKey(tick, 12, k.slot) });

    // -------------------------------------------------------------- K9 slip cap
    if (d.drift === 1) { const sm = P.sinBetaMax * v; if (wl > sm || wl < -sm) { wl = wl > 0 ? sm : -sm; u = Math.sqrt(v * v - wl * wl); } }

    // -------------------------------------------------------------- K10 fatigue, K11 drift bookkeeping
    let sb = 0;
    if (d.drift === 1) d.fatigueTicks++; else if (d.fatigueTicks > 0) d.fatigueTicks--;
    if (d.drift === 1) {
      sb = v > 0.1 ? (-d.driftDir * wl) / v : 0;
      d.driftTicks++;
      if (sb > d.driftPeak) d.driftPeak = sb;
      k.stats.driftMeters += v * DT;
      if (opt.gaugeOn && b.grounded && v >= 10 && sb > 0 && !b.wallContact) {
        let sl = sb / P.gSlipRef; if (sl > 1) sl = 1; sl = Math.sqrt(sl);
        const dg = P.g0 * sl * (v / P.vGrip) / (1 + (d.fatigueTicks * DT) / P.gTau) * DT * mods.gaugeMul;
        // §4.7 reverse gauge: counter-steering a boosted drift charges ×revGaugeMul
        addGauge(w, k, boosting && sIn <= -0.3 ? dg * P.revGaugeMul : dg, GaugeSrc.DRIFT, opt.teamSize, ctx);
      }
      if ((d.driftTicks >= P.exitMinTicks && d.driftEngagement === 0 && Math.abs(sb) < P.exitSin) || u < 5 || cut) {
        const allowInst = !opt.itemMode || opt.instantAllowed;
        if (allowInst && d.driftTicks >= P.instMinDriftTicks && d.driftPeak >= P.instMinSlip) d.instWindow = P.instWindowTicks;
        endDrift(w, k, P, ctx);
      }
    }

    // -------------------------------------------------------------- K12 instant boost, K13 boosters
    instantTrigger(w, k, P, ctx, opt, thrEdge, gm);
    fireBooster(w, k, P, ctx, opt, useEdge || autoFire);

    // -------------------------------------------------------------- K14 target speed
    const conv = zoned ? conveyorMul(k, T, surf) : (surf.conveyor ?? 1);
    let vT: number, boostLaw = true, cap = P.aBoostMax;
    if (d.boostTicks > 0) vT = d.boostKind === Boost.TEAM ? P.vTeam : P.vBoost;
    else if (d.startTicks > 0) { vT = P.vBoost * P.startCapMul; cap = P.aStartMax; }
    else if (mods.vTarget > 0) vT = Math.min(mods.vTarget, P.vBoost);
    else { vT = d.draftTicks > 0 ? P.vDraft : P.vGrip; boostLaw = false; }
    const capMul = mods.vCapMul;
    vT *= surf.vMul * conv * capMul;
    if (k.race.slowTicks > 0) { const sc = SLOW_CAP * P.vGrip; if (vT > sc) vT = sc; }
    const vInst = P.vInst * capMul;
    const instOn = d.instTicks > 0 && !boostLaw && u < vInst;
    // §4.8 a boost law (any source, including effect targets), a drift or an instant boost ends the bleed for good
    if (d.postTicks > 0 && (boostLaw || d.drift === 1 || d.instTicks > 0)) d.postTicks = 0;

    // -------------------------------------------------------------- K15a gears (§4.8), before the longitudinal law
    // zero-lock only on the ground, on a gentle grade and with the driver in control (a tether or CC moves the kart)
    const lockOk = !locked && gt2 <= P.zeroLockGt * P.zeroLockGt;
    let gear: GearState = d.gear, reverse = false;
    if (thrIn) gear = Gear.D;
    else if (brk) {
      if (u > 0.5) gear = Gear.D; // strong braking
      else if (gear !== Gear.R) {
        // the reverse-engage count starts at the stop: the transition tick is ↓ tick 1 at STOP, and R engages after
        // revEngageTicks of them however STOP was reached (braking, coasting, the start grid, a respawn)
        if (gear !== Gear.STOP) { gear = Gear.STOP; d.brakeTicks = 1; }
        else if (d.brakeTicks > P.revEngageTicks) gear = Gear.R;
      }
      reverse = gear === Gear.R;
    } else if (gear === Gear.D || (gear === Gear.STOP && (!lockOk || u * u + wl * wl > 0.25))) {
      // no keys: D coasts in N; a stop that cannot hold (steep grade, no control) or that something pushed rolls
      gear = Gear.N;
    }
    setGear(w, k, ctx, gear);

    if (gear === Gear.STOP) {
      // stopped (no ↑ here): the brake holds u = 0; on a gentle grade the kart is zero-locked
      u = 0;
      if (lockOk) wl = 0;
    } else {
      // ------------------------------------------------------------ K15 acceleration
      const A0 = P.a0 * (d.draftTicks > 0 && !boostLaw ? P.draftAccelMul : 1) * mods.accelMul;
      let a: number;
      if (thr) {
        if (u < vT) {
          if (boostLaw) {
            a = P.kBoost * (vT - u);
            if (a > cap) a = cap;
            const base = P.a0 * (1 - u / P.vGrip);
            if (a < base) a = base;
          } else {
            const q = u / vT;
            a = A0 * tau * (1 - q * q);
            if (d.drift === 1 && a > P.aDrift) a = P.aDrift;
          }
          if (instOn && a < P.aInst) a = P.aInst;
        } else {
          a = -P.kOver * (u - vT);
          if (instOn) a = P.aInst;
        }
        if (d.wheelspinTicks > 0) a *= 0.3;
      } else {
        a = u >= 0 ? -P.aCoast * surf.dragMul : P.aCoast * surf.dragMul; // coasting rolls toward rest either way
        if (u > vT) a -= P.kOver * (u - vT);
      }
      if (brk) {
        if (reverse) { const r = u < 0 ? -u / P.vReverse : 0; a = -P.aReverse * (1 - r * r); }
        else if (u > 0) a = -(d.drift === 1 ? P.aBrakeDrift : P.aBrake);
        else if (thrIn) a = u < 0 ? P.aBrake : 0; // brake wins when both pedals are held
      }
      let uN: number;
      if (d.dragTicks > 0 && thr && boostLaw) {
        // drag law: the injection carries u past vBoost; the cap (lifted by the tap streak) is on planar |v|
        const aI = P.aDrag * (d.tapStreak > 0 && d.tapGap < P.tapTicks ? P.tapAccelMul : 1);
        let vCap = P.vBoost * (P.dragCapMul + P.tapCapStep * d.tapStreak) * surf.vMul * conv * capMul;
        if (k.race.slowTicks > 0) { const sc = SLOW_CAP * P.vGrip; if (vCap > sc) vCap = sc; }
        const vp = Math.sqrt(u * u + wl * wl);
        if (vp > vCap) uN = u - P.kOver * (vp - vCap) * DT;
        else {
          uN = u + (a > aI ? a : aI) * DT;
          if (uN * uN + wl * wl > vCap * vCap) { const room = vCap * vCap - wl * wl; uN = room > u * u ? Math.sqrt(room) : u; }
        }
      } else if (d.postTicks > 0 && u > 0) {
        // post-boost bleed: near-critical decay toward the non-boost target with ↑ held, toward 0 with ↑ released
        // (never weaker than the held rule); a brake still wins when it is stronger
        if (thr) uN = u > vT ? vT + (u - vT) * DECAY_POST_HOLD : u + a * DT;
        else {
          let du = (vT - u) * (1 - DECAY_POST_HOLD);
          const dz = -u * (1 - DECAY_POST_REL);
          if (dz < du) du = dz;
          uN = u + du;
        }
        if (brk) { const ub = u + a * DT; if (ub < uN) uN = ub; }
      } else uN = u + a * DT;
      // Positive motor work is capped on actual planar speed, including a slide. Momentum already above
      // the target (for example after gravity on a downhill) is retained and decays by the usual force laws.
      if (thr && !brk && uN > u) {
        const motorCap = instOn ? Math.max(vT, vInst) : vT;
        const room = Math.sqrt(Math.max(0, motorCap * motorCap - wl * wl));
        uN = Math.max(u, Math.min(uN, room));
      }
      if (!reverse) {
        if ((thr === 0 || brk) && u >= 0 && uN < 0) uN = 0;
        else if ((thr === 0 || brk) && u < 0 && uN > 0) uN = 0;
      }
      u = uN;
      // N or R rolling to rest on a gentle grade stops (zero-lock from this tick). At rest means planar speed too,
      // the same 0.5 m/s as the STOP → N exit above: a kart bumped sideways keeps its push until it has died down
      if (u === 0 && !thrIn && !brk && lockOk && wl * wl <= 0.25) { setGear(w, k, ctx, Gear.STOP); wl = 0; }
    }

    // -------------------------------------------------------------- K16 drift drag (not while dragging)
    if (d.drift === 1 && sb > 0 && d.dragTicks === 0) { let f = 1 - P.cBeta * sb * sb * DT; if (f < 0) f = 0; u *= f; wl *= f; }

    // -------------------------------------------------------------- K17 recompose (coyote: full gravity, the kart is falling)
    b.vx = u * fx + wl * lx + vn * nx;
    b.vy = u * fy + wl * ly + vn * ny;
    b.vz = u * fz + wl * lz + vn * nz;
    if (!b.grounded) { b.vx += g.x * DT; b.vy += g.y * DT; b.vz += g.z * DT; }
  } else {
    // -------------------------------------------------------------- airborne: no steering or thrust, drift frozen
    b.yawRate *= decayF(P.airYawDamp, DT);
    rotateForward(k, b.yawRate * DT);
    airAttitude(k, g.x, g.y, g.z);
    instantTrigger(w, k, P, ctx, opt, thrEdge, gm);
    fireBooster(w, k, P, ctx, opt, useEdge || autoFire);
    // §4.8 in the air: no gear change; the drag ends, the cut counter resets; a boost, drift or instant boost
    // still cancels the bleed
    endDrag(w, k, ctx);
    d.counterTicks = 0;
    if (d.postTicks > 0 && (d.boostTicks > 0 || d.startTicks > 0 || mods.vTarget > 0 || d.drift === 1 || d.instTicks > 0)) d.postTicks = 0;
    b.vx += g.x * DT; b.vy += g.y * DT; b.vz += g.z * DT;
  }

  // gauge bonus charges (speed modes)
  if (opt.gaugeOn && d.draftTicks > 0) addGauge(w, k, P.draftGaugePerSec * gm * DT, GaugeSrc.BONUS, opt.teamSize, ctx);
  if (opt.infinite) addGauge(w, k, P.infiniteFillPerSec * DT, GaugeSrc.AUTO, opt.teamSize, ctx);

  latch(k, inp);
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  if (sp < 3) d.lowSpeedTicks++; else d.lowSpeedTicks = 0;
}

/** K19: remember this tick's held bits and throttle for next tick's edges. */
function latch(k: KartState, inp: Readonly<InputFrame>): void {
  k.drive.prevThrottle = inp.throttle > 0 ? 1 : 0;
  k.drive.prevHeld = inp.held;
}

/** K12: a throttle press edge inside the window fires the instant boost (+0.03 gauge in speed modes). */
function instantTrigger(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, opt: Readonly<DynamicsIn>, thrEdge: boolean, gm: number): void {
  const d = k.drive;
  if (d.instWindow <= 0 || !thrEdge) return;
  d.instTicks = P.instTicks; d.instWindow = 0; k.stats.instantBoosts++;
  ctx.events.push({ t: 'instantBoost', kart: k.slot, tick: w.tick, key: evKey(w.tick, 5, k.slot) });
  if (opt.gaugeOn) addGauge(w, k, P.instGaugeBonus * gm, GaugeSrc.BONUS, opt.teamSize, ctx);
}

/** K13: fires a stored booster (team first) on request when fewer than `chainTicks` of boost remain. */
function fireBooster(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, opt: Readonly<DynamicsIn>, request: boolean): void {
  const d = k.drive;
  if (opt.itemMode || !opt.racing || !request || d.boostTicks >= P.chainTicks || d.boosters + d.teamBoosters <= 0) return;
  if (d.teamBoosters > 0) { d.teamBoosters--; d.boostTicks += P.teamBoostTicks; d.boostKind = Boost.TEAM; }
  else { d.boosters--; d.boostTicks += P.tBoostTicks; d.boostKind = Boost.NORMAL; }
  k.stats.boostsUsed++;
  ctx.events.push({ t: 'boostStart', kart: k.slot, kind: d.boostKind, tick: w.tick, key: evKey(w.tick, 6, k.slot) });
}

/**
 * K5 (air): the nose eases toward the flight direction (K = 4 s⁻¹) and the kart's up follows the gravity up hint,
 * so a jumping kart pitches along its arc and lands wheels-down.
 */
function airAttitude(k: KartState, gx: number, gy: number, gz: number): void {
  const b = k.body;
  const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
  const hx = -gx / gl, hy = -gy / gl, hz = -gz / gl; // up hint
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  if (sp > 1) {
    const e = 1 - decayF(4, DT);
    let fx = b.fx + (b.vx / sp - b.fx) * e, fy = b.fy + (b.vy / sp - b.fy) * e, fz = b.fz + (b.vz / sp - b.fz) * e;
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
    // never pitch past ~64° (a vertical nose would leave no usable up vector)
    if (fl > 1e-6) { fx /= fl; fy /= fl; fz /= fl; if (fx * hx + fy * hy + fz * hz < 0.9 && fx * hx + fy * hy + fz * hz > -0.9) { b.fx = fx; b.fy = fy; b.fz = fz; } }
  }
  const hf = hx * b.fx + hy * b.fy + hz * b.fz;
  let nx = hx - hf * b.fx, ny = hy - hf * b.fy, nz = hz - hf * b.fz;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (nl > 1e-3) { nx /= nl; ny /= nl; nz /= nl; b.nx = nx; b.ny = ny; b.nz = nz; }
}
