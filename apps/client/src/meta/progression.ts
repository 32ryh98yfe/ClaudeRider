// Racer Level 1–50, XP and Sparks (13-modes-rules §10). Pure functions; `applyRace` writes the save.
import type { ModeId, TeamFormat, ThemeId, TrackId } from '@cr/content';
import type { SaveV1 } from './save.ts';

export const MAX_LEVEL = 50;
/** Placement bonus for ranks 1–8 (§10.1). Smaller fields use the first N entries. */
export const PLACEMENT_BONUS = [60, 45, 35, 28, 20, 14, 8, 4] as const;
export const LEVEL_UP_SPARKS = 50;

/** XP needed to go from `level` to level + 1 (Infinity at the cap). */
export function xpToNext(level: number): number { return level >= MAX_LEVEL ? Infinity : 100 + 25 * (level - 1); }
/** Cumulative XP needed to reach `level`. */
export function cumulativeXp(level: number): number { const n = Math.max(0, Math.min(MAX_LEVEL, level) - 1); return 100 * n + 12.5 * n * (n - 1); }
/** Level for a lifetime XP total. */
export function levelForXp(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= cumulativeXp(l + 1)) l++;
  return l;
}
/** Progress inside the current level: { level, into, need, frac }. */
export function levelProgress(xp: number): { level: number; into: number; need: number; frac: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, frac: 1 };
  const into = xp - cumulativeXp(level), need = xpToNext(level);
  return { level, into, need, frac: Math.max(0, Math.min(1, into / need)) };
}

/** Everything a finished race tells progression (built by meta/raceStats.ts from sim events + RaceResult). */
export interface RaceSummary {
  mode: ModeId; teams: TeamFormat; trackId: TrackId; themeId: ThemeId | ''; laps: number;
  finished: boolean; rank: number; field: number; teamWon: boolean; oneTwo: boolean; online: boolean;
  raceTicks: number | null; bestLapTicks: number | null; lapTicks: number[];
  /** ticks from GO at each key gate (first lap order), for split deltas */ splits: number[];
  stats: RaceStatBlock;
  ghostOn: boolean;
  mid: { id: string; done: boolean } | null;
}
export interface RaceStatBlock {
  driftMeters: number; perfectStarts: number; instantBoosts: number; boostersUsed: number; teamBoostersUsed: number;
  draftActivations: number; attacksLanded: number; attacksBlocked: number; hitsTaken: number; trapsEscapedFast: number;
  itemBoxes: number; cleanLaps: number; overtakes: number; shortcutsTaken: number; railsRidden: number; jumpsLanded: number;
  respawns: number; wallHits: number;
}
export function emptyStats(): RaceStatBlock {
  return { driftMeters: 0, perfectStarts: 0, instantBoosts: 0, boostersUsed: 0, teamBoostersUsed: 0, draftActivations: 0, attacksLanded: 0, attacksBlocked: 0, hitsTaken: 0, trapsEscapedFast: 0, itemBoxes: 0, cleanLaps: 0, overtakes: 0, shortcutsTaken: 0, railsRidden: 0, jumpsLanded: 0, respawns: 0, wallHits: 0 };
}

/** Records that this race improved (computed before the save is written). */
export interface PbInfo { newPbLaps: number; newPbRace: boolean; prevBestRace: number | null; prevBestLap: number | null }

export function computePb(s: Readonly<SaveV1>, r: RaceSummary): PbInfo {
  const rec = s.records[r.trackId];
  const prevLap = rec?.bestLapTicks ?? null;
  let best = prevLap ?? Infinity, newPbLaps = 0;
  for (const l of r.lapTicks) if (l > 0 && l < best) { best = l; newPbLaps++; }
  const prevRace = rec?.bestRaceTicks?.[r.mode] ?? null;
  const newPbRace = r.finished && r.raceTicks !== null && r.raceTicks > 0 && (prevRace === null || r.raceTicks < prevRace);
  return { newPbLaps, newPbRace, prevBestRace: prevRace, prevBestLap: prevLap };
}

/** Race XP before challenges (§10.1 and the Time Attack rule). */
export function raceXp(r: Pick<RaceSummary, 'mode' | 'finished' | 'rank' | 'field' | 'teamWon'>, pb: Pick<PbInfo, 'newPbLaps' | 'newPbRace'>): number {
  if (r.mode === 'timeAttack') return (r.finished ? 30 : 0) + 5 * pb.newPbLaps + (pb.newPbRace ? 50 : 0);
  const n = Math.max(1, Math.min(8, r.field));
  const bonus = r.finished && r.rank >= 1 && r.rank <= n ? PLACEMENT_BONUS[r.rank - 1]! : 0;
  return (r.finished ? 60 : 15) + bonus + (r.teamWon ? 40 : 0) + 5 * pb.newPbLaps;
}
export function raceSparks(baseXp: number): number { return Math.floor(0.5 * baseXp); }

/** Adds race stats into lifetime stats (`progress.stats`, §10.4). */
export function accumulateStats(stats: Record<string, number>, r: RaceSummary, pb: PbInfo, ghostBeaten: boolean): void {
  const add = (k: string, v: number): void => { if (v) stats[k] = (stats[k] ?? 0) + v; };
  add('races', 1);
  add('finishes', r.finished ? 1 : 0);
  add('wins', r.finished && r.rank === 1 && r.mode !== 'timeAttack' ? 1 : 0);
  add('podiums', r.finished && r.rank <= 3 && r.mode !== 'timeAttack' ? 1 : 0);
  add('teamWins', r.teams !== 'solo' && r.teamWon ? 1 : 0);
  add('oneTwos', r.oneTwo ? 1 : 0);
  add('timeAttackPBs', r.mode === 'timeAttack' && pb.newPbRace ? 1 : 0);
  add('ghostsBeaten', ghostBeaten ? 1 : 0);
  for (const [k, v] of Object.entries(r.stats)) add(k, v);
  if (r.themeId) add(`racesByTheme.${r.themeId}`, 1);
  add(`racesByMode.${r.mode}`, 1);
}
