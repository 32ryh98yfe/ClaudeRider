// Kart driving dynamics — 3D port of the validated gap-2 model (docs/research/sim-prototype.md), step by step as
// 10-sim-spec §5.1–§7 (K0–K19). Integrated ONCE per tick in the kart's tangent frame (forward f, left l = n × f,
// up n); position is integrated by motion.ts. Inside the sim, yaw rate and steer are + = LEFT (CCW seen from +n);
// InputFrame.steer is + = right, so the latch negates it.
//
// Timer convention: countdowns are decremented here, at the start of phase 3, and a countdown is active while it
// is > 0 after that decrement. A value set later in the tick (phases 4–7) or earlier (phases 1–2) is therefore
// written N + 1 to cover N dynamics phases (10-sim-spec §1.3).
import type { InputFrame } from '../core/input.ts';
import { Held, Edge } from '../core/input.ts';
import { Attach, Boost, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { decayF, smallCos, smallSin } from '../core/math.ts';
import type { KartMods, StepContext } from '../api.ts';
import type { SurfaceDef } from '@cr/content';
import { gripGain, type KartParams } from './params.ts';
import { evKey } from './evkey.ts';
import { addGauge, GaugeSrc } from './gauge.ts';
import { conveyorMul, effectiveSurface, gravityFor } from './zones.ts';
import { railDynamics } from './rail.ts';
import { hasZones } from './trackinfo.ts';

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

/** Ends a drift: lockout, canonical drift fields (10-sim-spec §15.2) and the driftEnd event. */
export function endDrift(w: WorldState, k: KartState, P: KartParams, ctx: StepContext): void {
  const d = k.drive;
  if (d.drift === 0) return;
  d.drift = 0; d.reDriftLock = P.reDriftTicks;
  d.driftDir = 1; d.driftTicks = 0; d.driftPeak = 0;
  ctx.events.push({ t: 'driftEnd', kart: k.slot, tick: w.tick, key: evKey(w.tick, 4, k.slot) });
}

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

  // ---------------------------------------------------------------- phase 1: input latch (§5.1)
  const locked = mods.noControl || k.race.respawnPhase !== 0;
  const wallStun = d.stunTicks > 0;
  const thrIn = !locked && inp.throttle > 0 ? 1 : 0;
  const tau = thrIn ? inp.throttle / 15 : 0;
  const thr = wallStun ? 0 : thrIn;                  // throttle for acceleration (proto: thr = stunned ? 0 : thrIn)
  const thrEdge = inp.throttle > 0 && d.prevThrottle === 0 && !locked;
  const driftHeld = !locked && (inp.held & Held.DRIFT) !== 0;
  const driftEdge = driftHeld && (d.prevHeld & Held.DRIFT) === 0;
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

    // -------------------------------------------------------------- K2 drift entry / double drift
    if (d.drift === 0) {
      if (driftHeld && (steer >= P.driftMinSteer || steer <= -P.driftMinSteer) && u >= P.driftMinSpeed && d.reDriftLock <= 0 && !wallStun) {
        d.drift = 1; d.driftDir = steer > 0 ? 1 : -1; d.driftTicks = 0; d.driftPeak = 0;
        k.stats.drifts++;
        b.yawRate += d.driftDir * P.kickR;
        rotateForward(k, d.driftDir * P.kickAngle);
        b.vx *= P.kickLoss; b.vy *= P.kickLoss; b.vz *= P.kickLoss;
        ev.push({ t: 'driftStart', kart: k.slot, tick, key: evKey(tick, 2, k.slot) });
      }
    } else if (driftEdge && d.driftTicks >= P.rekickMinTicks) {
      b.yawRate += d.driftDir * P.rekickR;
      rotateForward(k, d.driftDir * P.rekickAngle);
      b.vx *= P.rekickLoss; b.vy *= P.rekickLoss; b.vz *= P.rekickLoss;
      ev.push({ t: 'doubleDrift', kart: k.slot, tick, key: evKey(tick, 3, k.slot) });
    }
    fx = b.fx; fy = b.fy; fz = b.fz;
    u = b.vx * fx + b.vy * fy + b.vz * fz;

    // -------------------------------------------------------------- K4 yaw target and lag
    const sIn = steer * d.driftDir;
    let rT: number;
    if (d.drift === 0) {
      rT = steer * gripGain(u, P);
      if (u < -0.5) rT = -steer * P.yGrip * 0.5 * (-u) / (-u + P.gripV0);
    } else {
      rT = d.driftDir * (P.y0 / (1 + (d.driftTicks * DT) / P.y0T) + P.y1 * sIn + (driftHeld ? P.y2 : 0));
    }
    if (wallStun) rT *= 0.3;
    b.yawRate += (rT - b.yawRate) * (1 - decayF(d.drift === 0 ? P.kYawGrip : P.kYawDrift, DT));

    // -------------------------------------------------------------- K5 heading rotation
    rotateForward(k, b.yawRate * DT);
    fx = b.fx; fy = b.fy; fz = b.fz;
    const lx = ny * fz - nz * fy, ly = nz * fx - nx * fz, lz = nx * fy - ny * fx;

    // -------------------------------------------------------------- K6 decomposition
    u = b.vx * fx + b.vy * fy + b.vz * fz;
    let wl = b.vx * lx + b.vy * ly + b.vz * lz;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;

    // -------------------------------------------------------------- K7 slope gravity (tangential part; the ground takes the rest)
    if (b.grounded) {
      const gn = g.x * nx + g.y * ny + g.z * nz;
      const gtx = g.x - gn * nx, gty = g.y - gn * ny, gtz = g.z - gn * nz;
      u += (gtx * fx + gty * fy + gtz * fz) * DT;
      wl += (gtx * lx + gty * ly + gtz * lz) * DT;
    }
    let v = Math.sqrt(u * u + wl * wl);

    // -------------------------------------------------------------- K8 lateral damping with momentum retention
    let kL: number, eta: number;
    if (d.drift === 0) { kL = P.kLatGrip; eta = P.etaGrip; }
    else {
      eta = P.etaDrift;
      if (sIn >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sIn - 0.3) / 0.7);
      else if (sIn > -0.3) kL = P.kLatNeutral;
      else kL = P.kLatNeutral + (P.kLatCounter - P.kLatNeutral) * ((-sIn - 0.3) / 0.7);
      if (driftHeld) kL *= P.kLatShift;
    }
    kL *= surf.grip;
    const w2 = wl * decayF(kL, DT);
    const vRaw = Math.sqrt(u * u + w2 * w2);
    if (vRaw > 1e-6) { const f = (vRaw + eta * (v - vRaw)) / vRaw; u *= f; wl = w2 * f; } else wl = w2;
    v = Math.sqrt(u * u + wl * wl);

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
        addGauge(w, k, dg, GaugeSrc.DRIFT, opt.teamSize, ctx);
      }
      if ((d.driftTicks >= P.exitMinTicks && sb < P.exitSin) || u < 5) {
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
    else if (d.startTicks > 0) { vT = P.vBoost; cap = P.aStartMax; }
    else if (mods.vTarget > 0) vT = mods.vTarget;
    else { vT = d.draftTicks > 0 ? P.vDraft : P.vGrip; boostLaw = false; }
    const capMul = mods.vCapMul;
    vT *= surf.vMul * conv * capMul;
    if (k.race.slowTicks > 0) { const sc = SLOW_CAP * P.vGrip; if (vT > sc) vT = sc; }
    const vInst = P.vInst * capMul;
    const instOn = d.instTicks > 0 && !boostLaw && u < vInst;

    // -------------------------------------------------------------- K15 acceleration
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
    let reverse = false;
    if (brk) {
      if (u > 0.5 || thrIn) { if (u > 0) a = -(d.drift === 1 ? P.aBrakeDrift : P.aBrake); }
      else { const r = u < 0 ? -u / P.vReverse : 0; a = -8 * (1 - r * r); reverse = true; }
    }
    let uN = u + a * DT;
    if (!reverse) {
      if ((thr === 0 || brk) && u >= 0 && uN < 0) uN = 0;
      else if (thr === 0 && u < 0 && uN > 0) uN = 0;
    }
    u = uN;

    // -------------------------------------------------------------- K16 drift drag
    if (d.drift === 1 && sb > 0) { let f = 1 - P.cBeta * sb * sb * DT; if (f < 0) f = 0; u *= f; wl *= f; }

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
