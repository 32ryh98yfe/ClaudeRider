// Turns an ItemDef's `applies[]` entry into a scheduled effect (SCE with the entry's lead) and reports it.
import type { EffectApply, ItemDef } from '@cr/content';
import type { EffectInstance, WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { EF, EFlag } from './codes.ts';
import { authorityOf } from './decisions.ts';
import { resolveEffect, scheduleEffect } from './effects.ts';

/** Default SCE lead (ADR-007). */
export const DEFAULT_LEAD = 21;

/**
 * Schedules `a` on `victim` starting `lead` ticks from now. Lead 0 resolves immediately (self buffs, the user's own halo);
 * otherwise the authority broadcasts an `effect` decision so late joiners and spectators see the telegraph.
 */
export function applyTo(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, a: Readonly<EffectApply>, user: number, victim: number, lead: number, seed: number, param: number): EffectInstance | null {
  const code = EF[a.effect];
  const flags = a.to === 'victim' && def.blockedBy.length > 0 ? EFlag.BLOCKABLE : 0;
  const e = scheduleEffect(w, ctx, code, victim, user, w.tick + lead, a.durTicks ?? 0, param !== 0 ? param : a.param ?? 0, flags, seed);
  if (!e) return null;
  if (lead <= 0) { resolveEffect(w, ctx, e); return e; }
  const auth = authorityOf(w, ctx);
  if (auth) auth.emit({ k: 'effect', tick: w.tick, eff: e.id, code, victim, source: user, start: e.start, dur: e.end - e.start, flags: e.flags });
  return e;
}
