// Driving techniques (M5, docs/design/15-driving-techniques.md): helpers for the technique fields of KartDrive —
// drag (끌기), tap boost (톡톡이), cut, brake turn (고속턴), spin-out and gears. A technique never outlives its
// drift: every site that force-ends a drift (wall impact, hard CC, tether, rail capture, warp, respawn) calls
// clearDriftTech, and dynamics' endDrift does the same.
//
// Event keys use the evKey type ids 10–15 (drag, tapBoost, cut, brakeTurn, spinOut, gear; see evkey.ts).
import { Boost, type GearState, type KartDrive, type KartState, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import type { KartParams } from './params.ts';
import { evKey } from './evkey.ts';

/** Resets the per-drift technique fields: drag, tap streak and gap, cut counter, brake counter. Gear and bleed stay. */
export function resetTech(d: KartDrive): void {
  d.dragTicks = 0; d.tapStreak = 0; d.tapGap = 255; d.counterTicks = 0; d.brakeTicks = 0;
}

/** Leaves the drag state; emits drag{on:false} if the kart was dragging. */
export function endDrag(w: WorldState, k: KartState, ctx: StepContext): void {
  const d = k.drive;
  if (d.dragTicks > 0) ctx.events.push({ t: 'drag', kart: k.slot, on: false, tick: w.tick, key: evKey(w.tick, 10, k.slot, 0) });
  d.dragTicks = 0; d.tapStreak = 0; d.tapGap = 255;
}

/** Called wherever a drift is force-ended: ends the drag and resets the technique fields (§4.7). */
export function clearDriftTech(w: WorldState, k: KartState, ctx: StepContext): void {
  endDrag(w, k, ctx);
  resetTech(k.drive);
}

/**
 * Spin-out (§4.3, brake held ≥ spinTicks in a drift). The caller has already ended the drift (no instant window).
 * Cancels the active boost — stored boosters are kept — and the bleed, and stuns the kart. dynamics sets the
 * planar speed to spinSpeed at the end of the tick (§4.9).
 */
export function spinOut(w: WorldState, k: KartState, P: KartParams, ctx: StepContext): void {
  const d = k.drive;
  clearDriftTech(w, k, ctx);
  if (d.boostTicks > 0) ctx.events.push({ t: 'boostEnd', kart: k.slot, kind: d.boostKind, tick: w.tick, key: evKey(w.tick, 1, k.slot) });
  d.boostTicks = 0; d.boostKind = Boost.NONE; d.startTicks = 0; d.instTicks = 0; d.instWindow = 0; d.postTicks = 0;
  // set in phase 3 after this tick's stun was latched: +1 covers the next spinStunTicks ticks (10-sim-spec §1.3)
  d.stunTicks = P.spinStunTicks + 1;
  ctx.events.push({ t: 'spinOut', kart: k.slot, tick: w.tick, key: evKey(w.tick, 14, k.slot) });
}

/** Changes the gear; emits gear{gear} on a change. */
export function setGear(w: WorldState, k: KartState, ctx: StepContext, g: GearState): void {
  if (k.drive.gear === g) return;
  k.drive.gear = g;
  ctx.events.push({ t: 'gear', kart: k.slot, gear: g, tick: w.tick, key: evKey(w.tick, 15, k.slot, g) });
}
