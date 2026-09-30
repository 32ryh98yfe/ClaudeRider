// FROZEN (contracts.lock). The deterministic simulation step (ADR-003/005).
import type { InputFrame } from './core/input.ts';
import { NEUTRAL_INPUT, Edge } from './core/input.ts';
import { Phase, type WorldState } from './core/state.ts';
import { quantizeWorld } from './core/quant.ts';
import type { StepContext } from './api.ts';
import { paramsFor, type KartParams } from './kart/params.ts';
import { kartDynamics, type DynamicsIn } from './kart/dynamics.ts';
import { halfStep, kartContacts, type MotionState } from './kart/motion.ts';
import { updateDraft } from './kart/draft.ts';
import { updateProgress } from './race/progress.ts';
import { startRespawn, updateRespawn, MANUAL_COOLDOWN } from './race/respawn.ts';
import { updatePhase, updateRanks, updateRaceEnd, updateStartBoost } from './race/rules.ts';
import { computeMods, startEffects, stepBoxes, stepProjectilesHazards, tickEffects, useItems } from './items/runtime.ts';
import { stepTrackHazards } from './race/trackhazards.ts';

const PARAMS: KartParams[] = [];
const WEIGHTS: number[] = [];
const MS: MotionState[] = Array.from({ length: 8 }, () => ({ impactThisTick: false, contactThisTick: false, tx: 0, ty: 0, tz: 1 }));
const DYN: DynamicsIn = { gaugeOn: true, infinite: false, itemMode: false, instantAllowed: true, racing: false, teamSize: 1 };

/** Advances the world by exactly one tick. Mutates `w` in place. */
export function step(w: WorldState, inputs: ReadonlyArray<InputFrame>, ctx: StepContext): void {
  w.tick++;
  const cfg = ctx.cfg, T = ctx.track, K = w.karts;
  updatePhase(w, ctx);
  const racing = w.phase >= Phase.RACING && w.phase !== Phase.DONE;
  const mode = cfg.mode;
  DYN.itemMode = mode === 'item';
  DYN.gaugeOn = mode !== 'item';
  DYN.infinite = mode === 'infinite';
  DYN.instantAllowed = cfg.rules.instantBoostInItem;
  DYN.racing = racing;
  DYN.teamSize = cfg.teams === 'solo' ? 1 : cfg.teams === 'duo' ? 2 : 4;

  for (let i = 0; i < K.length; i++) {
    const k = K[i]!;
    if (!k.active) continue;
    const spec = ctx.content.karts.byCode[k.spec]!;
    PARAMS[i] = paramsFor(spec);
    WEIGHTS[i] = spec.weight;
  }

  // (2) effects starting now + modifiers
  startEffects(w, ctx);
  computeMods(w, ctx);

  // draft uses positions from the previous tick
  if (racing) updateDraft(w, ctx, 120, 90);

  // (1,3) inputs → dynamics
  for (let i = 0; i < K.length; i++) {
    const k = K[i]!;
    if (!k.active) continue;
    const inp = inputs[i] ?? NEUTRAL_INPUT;
    const P = PARAMS[i]!;
    T.gravityAt(k.race.loc, ctx.scratch.grav);
    updateStartBoost(w, k, inp, ctx);
    if (w.phase < Phase.RACING) {
      k.drive.prevThrottle = inp.throttle > 0 ? 1 : 0;
      k.drive.prevHeld = inp.held;
      k.body.vx = 0; k.body.vy = 0; k.body.vz = 0;
      continue;
    }
    if (k.race.respawnPhase !== 0) {
      updateRespawn(w, k, ctx);
      k.drive.prevThrottle = inp.throttle > 0 ? 1 : 0;
      k.drive.prevHeld = inp.held;
      if ((k.race.respawnPhase as number) !== 0) continue;
    }
    // manual respawn (R): only when slow for 1 s or while wrong-way, with cooldown
    if ((inp.edges & Edge.RESPAWN) !== 0 && w.tick >= k.race.manualCooldownUntil && (k.drive.lowSpeedTicks >= 60 || k.race.wrongWayTicks >= 72)) {
      k.race.manualCooldownUntil = w.tick + MANUAL_COOLDOWN;
      startRespawn(w, k, ctx);
      continue;
    }
    const surf = ctx.content.surfaceByCode[k.body.surf];
    kartDynamics(w, k, inp, P, ctx, ctx.scratch.mods[i]!, surf, DYN);
  }
  if (racing) useItems(w, inputs, ctx);

  // (4) move + collide in two half-displacements
  if (w.phase >= Phase.RACING) {
    for (let i = 0; i < K.length; i++) {
      const ms = MS[i]!;
      ms.impactThisTick = false; ms.contactThisTick = false;
      const k = K[i]!;
      if (!k.active) continue;
      T.frameAt(k.race.loc.path, k.race.loc.s, ctx.scratch.frame2);
      ms.tx = ctx.scratch.frame2.tx; ms.ty = ctx.scratch.frame2.ty; ms.tz = ctx.scratch.frame2.tz;
    }
    for (let half = 0; half < 2; half++) {
      for (let i = 0; i < K.length; i++) {
        const k = K[i]!;
        if (!k.active || k.race.respawnPhase !== 0) continue;
        T.gravityAt(k.race.loc, ctx.scratch.grav);
        halfStep(w, k, PARAMS[i]!, ctx, MS[i]!);
      }
      kartContacts(w, ctx, WEIGHTS);
    }
    for (let i = 0; i < K.length; i++) {
      const k = K[i]!;
      if (!k.active) continue;
      k.body.wallContact = MS[i]!.contactThisTick ? 1 : 0;
      if (k.body.grounded) k.body.airTicks = 0; else k.body.airTicks++;
      if (k.body.ghostTicks > 0) k.body.ghostTicks--;
    }
  }

  // (5,6) projectiles, hazards, boxes
  if (racing) { stepProjectilesHazards(w, ctx); stepTrackHazards(w, ctx); stepBoxes(w, ctx); }

  // (7) progress, laps, rules
  if (w.phase >= Phase.RACING) {
    for (let i = 0; i < K.length; i++) {
      const k = K[i]!;
      if (k.active) updateProgress(w, k, ctx);
    }
    updateRanks(w, ctx);
    const hardCap = Math.max(3 * cfg.laps * (T.meta.refLapTicks || 60 * 60), 240 * 60);
    updateRaceEnd(w, ctx, hardCap);
  }

  // (8) timers
  tickEffects(w, ctx);

  // (9) quantize — LAST
  quantizeWorld(w);
}
