// Targeting helpers (12-items-spec §4.4, §6.5). "Ahead"/"behind" use race distance D; "opponent" = different team
// (solo: everyone else). All helpers iterate karts by slot, so ties resolve deterministically.
import type { ItemDef } from '@cr/content';
import { Attach, type KartState, type WorldState } from '../core/state.ts';
import type { RaceConfig } from '../core/state.ts';

/** The part of StepContext the targeting rules need (the AI passes its own). */
export interface CfgCtx { readonly cfg: Readonly<Pick<RaceConfig, 'teams' | 'rules'>> }

export const teamMode = (ctx: CfgCtx): boolean => ctx.cfg.teams !== 'solo';

/** Teammates exist only in team formats (in solo every kart has team 0). */
export const sameTeam = (ctx: CfgCtx, a: Readonly<KartState>, b: Readonly<KartState>): boolean => teamMode(ctx) && a.team === b.team;

/** Still racing: present, not finished, not retired. */
export const inRace = (k: Readonly<KartState>): boolean => k.active === 1 && k.race.finishTick < 0 && k.race.retired === 0;

export const inWarp = (k: Readonly<KartState>): boolean => k.body.attachKind === Attach.WARP;

/** Friendly fire for an item's harm under the room rule (ADR-008): off / area items only / everything. */
export function friendlyAllowed(ctx: CfgCtx, def: Readonly<ItemDef>): boolean {
  const ff = ctx.cfg.rules.friendlyFire;
  return ff === 'all' || (ff === 'area' && def.friendlyFire === 'area');
}

/** Can `def` used by `user` affect `v` (v ≠ user)? Opponents always; teammates per the friendly-fire rule. */
export function canAffect(ctx: CfgCtx, user: Readonly<KartState>, v: Readonly<KartState>, def: Readonly<ItemDef>): boolean {
  if (v.slot === user.slot) return false;
  return !sameTeam(ctx, user, v) || friendlyAllowed(ctx, def);
}

/** Current leader (rank 1, finished or not). */
export function leaderSlot(w: Readonly<WorldState>): number {
  for (const k of w.karts) if (k.active && k.race.rank === 1) return k.slot;
  return 0;
}

/** Highest-ranked kart that is still racing and satisfies `ok` (−1 if none). */
export function bestRanked(w: Readonly<WorldState>, ok: (k: Readonly<KartState>) => boolean): number {
  let best = -1, bestRank = 99;
  for (const k of w.karts) if (inRace(k) && ok(k) && k.race.rank < bestRank) { bestRank = k.race.rank; best = k.slot; }
  return best;
}

/**
 * `leader` targets (Top-1 Missile, Throttle Drone): the leader, or −1 when the leader is the user or a teammate
 * (validity notIfLeaderSelfOrTeam) or no longer racing.
 */
export function leaderTarget(w: Readonly<WorldState>, ctx: CfgCtx, user: Readonly<KartState>): number {
  const l = w.karts[leaderSlot(w)]!;
  if (l.slot === user.slot || sameTeam(ctx, l, user) || !inRace(l)) return -1;
  return l.slot;
}

/** `aheadOfLeader` (Firewall): solo → the leader; team → the highest-ranked opponent. −1 when that is the user. */
export function firewallTarget(w: Readonly<WorldState>, ctx: CfgCtx, user: Readonly<KartState>): number {
  if (!teamMode(ctx)) {
    const l = w.karts[leaderSlot(w)]!;
    return l.slot === user.slot || !inRace(l) ? -1 : l.slot;
  }
  return bestRanked(w, (k) => k.team !== user.team);
}

/** `nextAheadOpponent` (Bug Report): the opponent directly ahead in rank (teammates skipped). */
export function nextAheadOpponent(w: Readonly<WorldState>, ctx: CfgCtx, user: Readonly<KartState>, def: Readonly<ItemDef>): number {
  let best = -1, bestRank = 0;
  for (const k of w.karts) {
    if (!inRace(k) || !canAffect(ctx, user, k, def) || k.race.rank >= user.race.rank) continue;
    if (k.race.rank > bestRank) { bestRank = k.race.rank; best = k.slot; }
  }
  return best;
}
