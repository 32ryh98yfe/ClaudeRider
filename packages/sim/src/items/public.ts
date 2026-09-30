// Stable read-only surface of the item runtime for the client (HUD, VFX, SFX) and other lanes:
//   import { projectileEta, airborneLift, IT, EF } from '@cr/sim/items/public.ts';
// Everything here is a pure function of public world state (safe on predictors and in render code).
export { IT, EF, EFlag, PPhase, Kin, Reject, RESULT_NAME, NO_TARGET, SOURCE_TRACK, itemDef, effectDef } from './codes.ts';
export { projectileEta, LEAD } from './projectiles.ts';
export { airborneLift, smooth } from './kinematics.ts';
export { lockNeed, lockedTarget, aimCandidateValid, cosDeg, USE_COOLDOWN, AIM_CONE_MARGIN_DEG, AIM_RANGE_MARGIN } from './use.ts';
export { bucketFor, boxRespawnDelay, ROULETTE_TICKS, ROULETTE_WAIT, PICKUP_R } from './boxes.ts';
export { activeEffect, SHIELD_GRACE } from './effects.ts';
export { tetherTarget } from './effect-behaviors/tether.ts';
export { dropTableFor, rollItem } from './roll.ts';
export { objectId } from './ids.ts';
export { TRAP_MAX_HEIGHT } from './hazards.ts';
export type { ItemBehavior, EffectBehavior } from './behavior.ts';
