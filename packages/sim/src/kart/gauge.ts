// Drift gauge, stored boosters and the team gauge (10-sim-spec §8, ADR-008).
import type { KartState, WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { evKey } from './evkey.ts';

/** Maximum stored boosters (normal + team). */
export const BOOSTER_SLOTS = 2;

/** Where a gauge gain comes from: the drift term, a bonus charge (start/instant/draft), or Infinite Boost auto-fill. */
export const GaugeSrc = { DRIFT: 0, BONUS: 1, AUTO: 2 } as const;

/**
 * Adds `dg` to the kart's drift gauge. A full gauge becomes a stored booster when a slot is free, else it is held
 * at 1. Drift and bonus gains also feed the team gauge in team modes. Infinite Boost auto-fill does not: with it
 * every teammate would earn a team booster every few seconds, and the team gauge exists to reward driving [P].
 */
export function addGauge(w: WorldState, k: KartState, dg: number, src: number, teamSize: number, ctx: StepContext): void {
  if (dg <= 0) return;
  const d = k.drive;
  d.gauge += dg;
  if (d.gauge >= 1) {
    if (d.boosters + d.teamBoosters < BOOSTER_SLOTS) {
      d.boosters++; d.gauge -= 1;
      ctx.events.push({ t: 'gaugeFull', kart: k.slot, tick: w.tick, key: evKey(w.tick, 7, k.slot) });
    } else d.gauge = 1;
  }
  if (teamSize > 1 && src !== GaugeSrc.AUTO) addTeamGauge(w, k.team, dg, teamSize, ctx);
}

/**
 * Team gauge (size 2 · teamSize). When it fills, every teammate still racing receives one team booster: into a
 * free slot, else by converting a stored normal booster; a kart already holding two team boosters gets nothing.
 */
export function addTeamGauge(w: WorldState, team: number, dg: number, teamSize: number, ctx: StepContext): void {
  const t = w.teams[team];
  if (!t) return;
  const size = 2 * teamSize;
  t.gauge += dg;
  if (t.gauge < size) return;
  t.gauge = 0;
  t.granted++;
  ctx.events.push({ t: 'teamGaugeFull', team, tick: w.tick, key: evKey(w.tick, 8, team) });
  const K = w.karts;
  for (let i = 0; i < K.length; i++) {
    const m = K[i]!;
    if (!m.active || m.team !== team || m.race.retired || m.race.finishTick >= 0) continue;
    const md = m.drive;
    if (md.boosters + md.teamBoosters < BOOSTER_SLOTS) md.teamBoosters++;
    else if (md.boosters > 0) { md.boosters--; md.teamBoosters++; }
  }
}

/** Team size of the configured format (1 in solo). */
export function teamSizeOf(teams: 'solo' | 'duo' | 'squad'): number {
  return teams === 'solo' ? 1 : teams === 'duo' ? 2 : 4;
}
