// Item runtime (lane L2 / ITEMS): the hook points step() calls in ADR-005 order.
// Rules: every authority-only choice (the roll) is made only when ctx.role === 'authority' and published through
// ctx.authority.emit(); predictors read it back from world.decisions. Everything else — targets, commits, results,
// contacts, mash — is computed identically on both sides from inputs and state (20-netcode-spec §8).
import type { InputFrame } from '../core/input.ts';
import type { Decision, WorldState } from '../core/state.ts';
import type { Tick } from '../core/units.ts';
import { neutralMods, type StepContext } from '../api.ts';
import { rubberBandMul } from '../race/rubberband.ts';
import { ROULETTE_TICKS } from './boxes.ts';
import { applyEffectMods, endEffects, startEffectsNow } from './effects.ts';
import { stepHazards } from './hazards.ts';
import { applyKinematics, creditMash } from './kinematics.ts';
import { stepProjectiles } from './projectiles.ts';
import { itemPhase } from './use.ts';

/** ADR-005 step 2: effects whose start tick is now (by id order). */
export function startEffects(w: WorldState, ctx: StepContext): void {
  if (w.effects.length > 0) startEffectsNow(w, ctx);
}

/** Aggregates active effects into ctx.scratch.mods[slot]. */
export function computeMods(w: WorldState, ctx: StepContext): void {
  for (let i = 0; i < w.karts.length; i++) {
    const m = neutralMods(ctx.scratch.mods[i]!);
    // bot tier speed multiplier (≤ 1, public via RaceConfig → predicted identically everywhere)
    const sc = ctx.cfg.slots[i];
    if (sc && sc.kind === 'bot' && sc.vMul > 0 && sc.vMul < 1) m.vCapMul = sc.vMul;
    if (ctx.cfg.rules.rubberBand) m.vCapMul *= rubberBandMul(w, w.karts[i]!, ctx);
  }
  applyEffectMods(w, ctx);
}

// step() hands the inputs to useItems only; the phase-6 item handling (stepBoxes) reads them from here. step() is
// synchronous, so the reference never leaks between worlds.
let INPUTS: ReadonlyArray<InputFrame> | null = null;

/** After kart dynamics, before the move: mash-out credits, hard-CC kinematic curves, tether pursuit. */
export function useItems(w: WorldState, inputs: ReadonlyArray<InputFrame>, ctx: StepContext): void {
  INPUTS = inputs;
  if (w.effects.length === 0) return;
  creditMash(w, inputs, ctx);
  applyKinematics(w, ctx);
}

/** ADR-005 step 5: projectiles + hazards. */
export function stepProjectilesHazards(w: WorldState, ctx: StepContext): void {
  if (w.projectiles.length > 0) stepProjectiles(w, ctx);
  if (w.hazards.length > 0 || w.effects.length > 0) stepHazards(w, ctx);
}

/** ADR-005 step 6: roulette, swap, aim, use, personal item boxes (item mode only). */
export function stepBoxes(w: WorldState, ctx: StepContext): void {
  const inputs = INPUTS;
  INPUTS = null;
  if (ctx.cfg.mode !== 'item') return;
  itemPhase(w, inputs, ctx);
}

/** ADR-005 step 8: effect endings (onEnd), then canonicalize expired absolute ticks to 0 (10-sim-spec §1.3). */
export function tickEffects(w: WorldState, ctx: StepContext): void {
  if (w.effects.length > 0 || anyCC(w)) endEffects(w, ctx);
  const t = w.tick;
  for (const k of w.karts) {
    const st = k.status;
    if (st.immuneUntil <= t) st.immuneUntil = 0;
    if (st.shieldUntil <= t) st.shieldUntil = 0;
    if (st.shieldGraceUntil <= t) st.shieldGraceUntil = 0;
    if (st.haloUntil <= t) st.haloUntil = 0;
    if (k.items.rouletteSlot < 0) { k.items.rouletteEnd = 0; k.items.rouletteBox = -1; }
  }
  const br = w.boxRespawn;
  for (let i = 0; i < br.length; i++) if (br[i]! !== 0 && br[i]! <= t) br[i] = 0;
}

function anyCC(w: Readonly<WorldState>): boolean {
  for (const k of w.karts) if (k.status.cc !== 0) return true;
  return false;
}

/**
 * Predictor side: insert a server decision into the world. Returns the tick to roll back from if the decision affects
 * the past (≤ w.tick), or null if it lies in the future and was merely scheduled (B3).
 * A grant for a roulette that is still spinning in the predicted world is patched in place (the slot content only
 * matters from P + 30 on), so it needs no rollback. Once the predicted world is past the landing (a grant later than
 * 30 ticks), the item could already have been used on the authority, so that grant rolls back like any other.
 */
export function applyDecision(w: WorldState, d: Decision): Tick | null {
  w.decisions.items.push(d);
  if (d.tick > w.tick) return null;
  if (d.k === 'grant') {
    const k = w.karts[d.slot];
    const it = k?.items;
    if (k && it && it.rouletteSlot >= 0 && it.rouletteBox === d.boxId && it.rouletteEnd - ROULETTE_TICKS === d.tick && w.tick < it.rouletteEnd) {
      const cur = it.rouletteSlot === 0 ? it.slot0 : it.slot1;
      if (cur === 0 || cur === d.item) {
        if (it.rouletteSlot === 0) it.slot0 = d.item; else it.slot1 = d.item;
        return null;
      }
    }
  }
  return d.tick;
}
