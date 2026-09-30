// Item runtime (owned by lane L2 / ITEMS). M1 provides the hook points used by step(); L2 fills them in.
// Rules: every authority-only choice (roll, target, commit tick, result) is guarded by ctx.role === 'authority'
// and published via ctx.authority.emit(); predictors read the same choices back from world.decisions.
import type { InputFrame } from '../core/input.ts';
import type { Decision, WorldState } from '../core/state.ts';
import type { Tick } from '../core/units.ts';
import { neutralMods, type StepContext } from '../api.ts';
import { rubberBandMul } from '../race/rubberband.ts';

/** ADR-005 step 2: effects whose start tick is now (by id order). */
export function startEffects(_w: WorldState, _ctx: StepContext): void { /* L2 */ }

/** Aggregates active effects into ctx.scratch.mods[slot]. */
export function computeMods(w: WorldState, ctx: StepContext): void {
  for (let i = 0; i < w.karts.length; i++) {
    const m = neutralMods(ctx.scratch.mods[i]!);
    // bot tier speed multiplier (≤ 1, public via RaceConfig → predicted identically everywhere)
    const sc = ctx.cfg.slots[i];
    if (sc && sc.kind === 'bot' && sc.vMul > 0 && sc.vMul < 1) m.vCapMul = sc.vMul;
    if (ctx.cfg.rules.rubberBand) m.vCapMul *= rubberBandMul(w, w.karts[i]!, ctx);
  }
}

/** Item use edges (item mode). */
export function useItems(_w: WorldState, _inputs: ReadonlyArray<InputFrame>, _ctx: StepContext): void { /* L2 */ }

/** ADR-005 step 5: projectiles + hazards. */
export function stepProjectilesHazards(_w: WorldState, _ctx: StepContext): void { /* L2 */ }

/** ADR-005 step 6: personal item boxes + roulette. */
export function stepBoxes(_w: WorldState, _ctx: StepContext): void { /* L2 */ }

/** ADR-005 step 8: effect timers / expiry. */
export function tickEffects(_w: WorldState, _ctx: StepContext): void { /* L2 */ }

/**
 * Predictor side: insert a server decision into the world. Returns the tick to roll back from if the
 * decision affects the past (≤ w.tick), or null if it lies in the future and was merely scheduled.
 */
export function applyDecision(w: WorldState, d: Decision): Tick | null {
  w.decisions.items.push(d);
  return d.tick <= w.tick ? d.tick : null;
}
