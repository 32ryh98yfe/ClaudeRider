// Item and effect behaviour contracts (B7). Behaviours live one per file in items/behaviors/<key>.ts and
// items/effect-behaviors/<key>.ts and are discovered by tools/gen-registries.mjs (keyed by file name).
import type { ItemDef } from '@cr/content';
import type { EffectInstance, HazardState, KartState, ProjectileState, WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';

export interface ItemBehavior {
  /**
   * Called at the use tick T (phase 6) after the generic refusal checks passed. 'ok' and 'fizzle' consume the item,
   * 'reject' leaves it in the slot. Behaviours report the object id / target they created through `useOut`.
   */
  onUse?(w: WorldState, user: number, def: ItemDef, ctx: StepContext): 'ok' | 'fizzle' | 'reject';
  tickProjectile?(w: WorldState, p: ProjectileState, ctx: StepContext): void;
  tickHazard?(w: WorldState, h: HazardState, ctx: StepContext): void;
}

export interface EffectBehavior {
  /** Resolution produced a hit (phase 2 or the contact phase). */
  onStart?(w: WorldState, e: EffectInstance, ctx: StepContext): void;
  /** Every tick while active, after kart dynamics (kinematic effects). */
  onTick?(w: WorldState, e: EffectInstance, k: KartState, ctx: StepContext): void;
  /** Ending. Returning false skips the definition's onEnd applies (the tether slingshot is proximity-only). */
  onEnd?(w: WorldState, e: EffectInstance, ctx: StepContext): boolean | void;
  /** The effect is fully applied by onStart (writes kart state) and is not kept in the effect list. */
  instant?: boolean;
}

/** Scratch written by ItemBehavior.onUse: the object id and target reported in the `use` decision. */
export const useOut = { obj: 0, target: 255 };
