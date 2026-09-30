// Kart driving dynamics — 3D port of the validated gap-2 model (docs/research/sim-prototype.md).
// Integrated ONCE per tick in the kart's tangent frame (forward f, left l = n × f, up n).
// Convention inside the sim: yaw rate / steer + = LEFT (CCW seen from above). InputFrame.steer + = right.
import type { InputFrame } from '../core/input.ts';
import { Held, Edge } from '../core/input.ts';
import { Boost, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { decayF, smallCos, smallSin } from '../core/math.ts';
import type { KartMods, StepContext } from '../api.ts';
import type { SurfaceDef } from '@cr/content';
import { gripGain, type KartParams } from './params.ts';
import { evKey } from './evkey.ts';

const SURF_DEFAULT: SurfaceDef = { id: 'asphalt', code: 1, grip: 1, vMul: 1, dragMul: 1 };

/** Rotates the kart forward vector around its up by angle a (small). */
function rotateForward(k: KartState, a: number): void {
  const b = k.body;
  const s = smallSin(a), c = smallCos(a);
  // l = n × f
  const lx = b.ny * b.fz - b.nz * b.fy, ly = b.nz * b.fx - b.nx * b.fz, lz = b.nx * b.fy - b.ny * b.fx;
  let fx = b.fx * c + lx * s, fy = b.fy * c + ly * s, fz = b.fz * c + lz * s;
  const n = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  fx /= n; fy /= n; fz /= n;
  b.fx = fx; b.fy = fy; b.fz = fz;
}

export interface DynamicsIn { gaugeOn: boolean; infinite: boolean; itemMode: boolean; instantAllowed: boolean; racing: boolean; teamSize: number }

/**
 * Advances drive state + velocity for one tick. Position is integrated by the caller (motion.ts).
 * `surf` is the surface under the kart; `mods` are aggregated effect modifiers; `draftOn` whether the draft burst is active.
 */
export function kartDynamics(w: WorldState, k: KartState, inp: Readonly<InputFrame>, P: KartParams, ctx: StepContext, mods: Readonly<KartMods>, surfDef: SurfaceDef | undefined, opt: DynamicsIn): void {
  const b = k.body, d = k.drive, ev = ctx.events, tick = w.tick;
  const surf = surfDef ?? SURF_DEFAULT;

  // ---------------------------------------------------------------- boost pads (surface under the kart)
  if (b.grounded && surf.id === 'boost_pad' && d.boostTicks < 30) {
    if (d.boostTicks === 0) ev.push({ t: 'boostStart', kart: k.slot, kind: Boost.PAD, tick, key: evKey(tick, 9, k.slot) });
    d.boostTicks = 45; if (d.boostKind === Boost.NONE) d.boostKind = Boost.PAD;
  }
  if (b.grounded && surf.id === 'jump_pad' && d.stunTicks === 0 && b.airTicks === 0) {
    b.vx += b.nx * 12; b.vy += b.ny * 12; b.vz += b.nz * 12;
  }

  // ---------------------------------------------------------------- timers
  if (d.boostTicks > 0) { d.boostTicks--; if (d.boostTicks === 0) { ev.push({ t: 'boostEnd', kart: k.slot, kind: d.boostKind, tick, key: evKey(tick, 1, k.slot) }); d.boostKind = Boost.NONE; } }
  if (d.startTicks > 0) d.startTicks--;
  if (d.instTicks > 0) d.instTicks--;
  if (d.instWindow > 0) d.instWindow--;
  if (d.stunTicks > 0) d.stunTicks--;
  if (d.reDriftLock > 0) d.reDriftLock--;
  if (d.wheelspinTicks > 0) d.wheelspinTicks--;
  if (d.draftTicks > 0) d.draftTicks--;

  const locked = mods.noControl || k.race.respawnPhase !== 0;
  const stunned = d.stunTicks > 0 || locked;
  const thrRaw = inp.throttle > 0 ? inp.throttle / 15 : 0;
  const thrIn = thrRaw > 0 ? 1 : 0;
  const thr = stunned ? 0 : thrRaw;
  const thrEdge = thrIn === 1 && d.prevThrottle === 0;
  const driftHeld = !locked && (inp.held & Held.DRIFT) !== 0;
  const driftEdge = driftHeld && (d.prevHeld & Held.DRIFT) === 0;
  const useEdge = !locked && (inp.edges & Edge.USE_ITEM) !== 0;
  const autoFire = !locked && (inp.held & Held.ITEM) !== 0;
  let steer = -inp.steer / 127;
  if (mods.steerInvert) steer = -steer;
  steer *= mods.steerMul;
  if (locked) steer = 0;
  steer = steer > 1 ? 1 : steer < -1 ? -1 : steer;
  const brake = !locked && inp.brake > 0 ? inp.brake / 15 : 0;

  // tangent frame
  let fx = b.fx, fy = b.fy, fz = b.fz;
  const nx = b.nx, ny = b.ny, nz = b.nz;
  let lx: number, ly: number, lz: number, wl: number; // left axis + lateral speed, rebuilt after each yaw
  let u = b.vx * fx + b.vy * fy + b.vz * fz;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;

  if (b.grounded) {
    // ------------------------------------------------------------ drift entry / double drift
    if (d.drift === 0) {
      if (driftHeld && (steer >= P.driftMinSteer || steer <= -P.driftMinSteer) && u >= P.driftMinSpeed && d.reDriftLock <= 0 && !stunned) {
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

    // ------------------------------------------------------------ yaw
    const sIn = steer * d.driftDir;
    let rT: number;
    if (d.drift === 0) {
      const vv = u > 0 ? u : 0;
      rT = steer * gripGain(vv, P);
      if (u < -0.5) rT = -steer * P.yGrip * 0.5 * (-u) / (-u + P.gripV0);
    } else {
      const tDrift = d.driftTicks * DT;
      rT = d.driftDir * (P.y0 / (1 + tDrift / P.y0T) + P.y1 * sIn + (driftHeld ? P.y2 : 0));
    }
    if (stunned) rT *= 0.3;
    b.yawRate += (rT - b.yawRate) * (1 - decayF(d.drift === 0 ? P.kYawGrip : P.kYawDrift, DT));
    rotateForward(k, b.yawRate * DT);
    fx = b.fx; fy = b.fy; fz = b.fz;
    lx = ny * fz - nz * fy; ly = nz * fx - nx * fz; lz = nx * fy - ny * fx;
    u = b.vx * fx + b.vy * fy + b.vz * fz;
    wl = b.vx * lx + b.vy * ly + b.vz * lz;
    let v = Math.sqrt(u * u + wl * wl);

    // ------------------------------------------------------------ lateral damping with momentum retention
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
    if (d.drift === 1) { const sm = P.sinBetaMax * v; if (wl > sm || wl < -sm) { wl = wl > 0 ? sm : -sm; u = Math.sqrt(v * v - wl * wl); } }

    // ------------------------------------------------------------ gauge + drift exit
    let sb = 0;
    if (d.drift === 1) d.fatigueTicks++; else if (d.fatigueTicks > 0) d.fatigueTicks--;
    if (d.drift === 1) {
      sb = v > 0.1 ? (-d.driftDir * wl) / v : 0;
      d.driftTicks++;
      if (sb > d.driftPeak) d.driftPeak = sb;
      k.stats.driftMeters += v * DT;
      if (opt.gaugeOn && v >= 10 && sb > 0 && !b.wallContact) {
        let sl = sb / P.gSlipRef; if (sl > 1) sl = 1; sl = Math.sqrt(sl);
        const dg = P.g0 * sl * (v / P.vGrip) / (1 + (d.fatigueTicks * DT) / P.gTau) * DT * mods.gaugeMul;
        addGauge(w, k, dg, P, ctx, opt);
      }
      if ((d.driftTicks >= P.exitMinTicks && sb < P.exitSin) || u < 5) {
        d.drift = 0; d.reDriftLock = P.reDriftTicks;
        const allowInst = !opt.itemMode || opt.instantAllowed;
        if (allowInst && d.driftTicks >= P.instMinDriftTicks && d.driftPeak >= P.instMinSlip) d.instWindow = P.instWindowTicks;
        ev.push({ t: 'driftEnd', kart: k.slot, tick, key: evKey(tick, 4, k.slot) });
      }
    }
    if (opt.infinite) addGauge(w, k, 0.45 * DT, P, ctx, opt);

    // ------------------------------------------------------------ instant boost / boosters
    if (d.instWindow > 0 && thrEdge) {
      d.instTicks = P.instTicks; d.instWindow = 0; k.stats.instantBoosts++;
      ev.push({ t: 'instantBoost', kart: k.slot, tick, key: evKey(tick, 5, k.slot) });
    }
    if (!opt.itemMode && opt.racing && (useEdge || autoFire) && d.boostTicks < P.chainTicks) {
      if (d.teamBoosters > 0) {
        d.teamBoosters--; d.boostTicks += P.teamBoostTicks; d.boostKind = Boost.TEAM; k.stats.boostsUsed++;
        ev.push({ t: 'boostStart', kart: k.slot, kind: Boost.TEAM, tick, key: evKey(tick, 6, k.slot) });
      } else if (d.boosters > 0) {
        d.boosters--; d.boostTicks += P.tBoostTicks; d.boostKind = Boost.NORMAL; k.stats.boostsUsed++;
        ev.push({ t: 'boostStart', kart: k.slot, kind: Boost.NORMAL, tick, key: evKey(tick, 6, k.slot) });
      }
    }

    // ------------------------------------------------------------ longitudinal
    const boosting = d.boostTicks > 0 || d.startTicks > 0 || mods.vTarget > 0;
    const vGripS = P.vGrip * surf.vMul * mods.vCapMul;
    let vT = boosting ? (mods.vTarget > 0 ? mods.vTarget : P.vBoost) * (d.boostKind === Boost.TEAM ? 1.02 : 1) * surf.vMul * mods.vCapMul : vGripS;
    let a0 = P.a0 * mods.accelMul;
    if (d.draftTicks > 0 && !boosting) { const vd = P.draftVMul * vGripS; if (vd > vT) vT = vd; a0 *= P.draftAccelMul; }
    let a: number;
    const instOn = d.instTicks > 0 && !boosting && u < P.vInst;
    if (thr > 0) {
      if (u < vT) {
        if (boosting) {
          a = P.kBoost * (vT - u);
          const cap = d.startTicks > 0 ? P.aStartMax : P.aBoostMax;
          if (a > cap) a = cap;
          const base = a0 * (1 - u / vGripS);
          if (a < base) a = base;
        } else {
          const q = u / vT;
          a = a0 * (1 - q * q) * thr;
          if (d.drift === 1 && a > P.aDrift) a = P.aDrift;
        }
        if (instOn && a < P.aInst) a = P.aInst;
      } else {
        a = -P.kOver * (u - vT);
        if (instOn) a = P.aInst;
      }
      if (d.wheelspinTicks > 0) a *= 0.3;
    } else {
      a = -P.aCoast * surf.dragMul;
      if (u > vT) a -= P.kOver * (u - vT);
      if (u < 0) a = P.aCoast * surf.dragMul; // coasting in reverse → roll to a stop
    }
    if (brake > 0) {
      if (u > 0.5) a = -(d.drift === 1 ? P.aBrakeDrift : P.aBrake) * brake;
      else if (thr === 0) a = u > -P.vReverse ? -8 * brake : 0; // reverse
    }
    let uN = u + a * DT;
    if (thr === 0 && brake === 0 && ((u >= 0 && uN < 0) || (u < 0 && uN > 0))) uN = 0;
    if (brake > 0 && u > 0.5 && uN < 0) uN = 0;
    u = uN;
    if (d.drift === 1 && sb > 0) { let f = 1 - P.cBeta * sb * sb * DT; if (f < 0) f = 0; u *= f; wl *= f; }

    // recompose (keep the normal component; ground snap handles it) + slope gravity
    const g = ctx.scratch.grav;
    const gn = g.x * nx + g.y * ny + g.z * nz;
    const gtx = g.x - gn * nx, gty = g.y - gn * ny, gtz = g.z - gn * nz;
    const sg = P.slopeGravity * DT;
    b.vx = u * fx + wl * lx + vn * nx + gtx * sg;
    b.vy = u * fy + wl * ly + vn * ny + gty * sg;
    b.vz = u * fz + wl * lz + vn * nz + gtz * sg;
  } else {
    // ------------------------------------------------------------ airborne: no steering, no gauge, drift frozen
    b.yawRate *= decayF(P.airYawDamp, DT);
    rotateForward(k, b.yawRate * DT);
    if (d.fatigueTicks > 0) d.fatigueTicks--;
    if (d.instWindow > 0 && thrEdge) { d.instTicks = P.instTicks; d.instWindow = 0; k.stats.instantBoosts++; }
    if (!opt.itemMode && opt.racing && (useEdge || autoFire) && d.boostTicks < P.chainTicks && d.boosters + d.teamBoosters > 0) {
      if (d.teamBoosters > 0) { d.teamBoosters--; d.boostTicks += P.teamBoostTicks; d.boostKind = Boost.TEAM; }
      else { d.boosters--; d.boostTicks += P.tBoostTicks; d.boostKind = Boost.NORMAL; }
      k.stats.boostsUsed++;
      ev.push({ t: 'boostStart', kart: k.slot, kind: d.boostKind, tick, key: evKey(tick, 6, k.slot) });
    }
    const g = ctx.scratch.grav;
    b.vx += g.x * DT; b.vy += g.y * DT; b.vz += g.z * DT;
    // mild air drag keeps jumps sane
    const drag = 1 - 0.02 * DT;
    b.vx *= drag; b.vz *= drag;
  }

  d.prevThrottle = thrIn;
  d.prevHeld = inp.held;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  if (sp < 3) d.lowSpeedTicks++; else d.lowSpeedTicks = 0;
}

/** Adds drift gauge; converts to boosters and feeds the team gauge (team speed modes). */
export function addGauge(w: WorldState, k: KartState, dg: number, P: KartParams, ctx: StepContext, opt: DynamicsIn): void {
  const d = k.drive;
  d.gauge += dg;
  if (d.gauge >= 1) {
    if (d.boosters < P.slots) {
      d.boosters++; d.gauge -= 1;
      ctx.events.push({ t: 'gaugeFull', kart: k.slot, tick: w.tick, key: evKey(w.tick, 7, k.slot) });
    } else d.gauge = 1;
  }
  if (opt.teamSize > 1 && !opt.infinite) {
    const team = w.teams[k.team];
    if (team) {
      team.gauge += dg / (2 * opt.teamSize);
      if (team.gauge >= 1) {
        team.gauge -= 1; team.granted++;
        for (const m of w.karts) if (m.active && m.team === k.team && m.drive.teamBoosters < 1) m.drive.teamBoosters = 1;
        ctx.events.push({ t: 'teamGaugeFull', team: k.team, tick: w.tick, key: evKey(w.tick, 8, k.team) });
      }
    }
  }
}
