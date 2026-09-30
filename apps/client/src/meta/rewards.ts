// Applies a finished race to the save: records, lifetime stats, challenges, XP/Sparks, level-ups and unlocks.
// Returns a report the results screen animates. The client never computes placements (they come from RaceResult).
import { save, type SaveV1 } from './save.ts';
import { accumulateStats, computePb, levelForXp, raceSparks, raceXp, LEVEL_UP_SPARKS, type RaceSummary } from './progression.ts';
import { applyChallenges, ensureRotation, type ChallengeUpdate } from './challenges.ts';
import { unlockedBetween, type UnlockDef } from './unlocks.ts';

export interface RewardReport {
  xpBase: number; xpChallenges: number; xpMid: number; xpTotal: number;
  sparksBase: number; sparksChallenges: number; sparksMid: number; sparksLevelUp: number; sparksTotal: number;
  xpBefore: number; xpAfter: number; levelBefore: number; levelAfter: number;
  unlocked: UnlockDef[];
  challenges: ChallengeUpdate[];
  mid: { id: string; done: boolean } | null;
  pb: { lap: boolean; race: boolean; prevRace: number | null };
  ghostBeaten: boolean;
}

export const MID_REWARD = { xp: 30, sparks: 20 } as const;

/** Pure core (testable): mutates `s`, returns the report. */
export function applyRaceTo(s: SaveV1, r: RaceSummary, now: Date = new Date()): RewardReport {
  ensureRotation(s, now);
  const pb = computePb(s, r);
  const ghostBeaten = r.mode === 'timeAttack' && r.ghostOn && pb.prevBestRace !== null && pb.newPbRace;
  // records
  const rec = (s.records[r.trackId] ??= {});
  for (const l of r.lapTicks) if (l > 0 && (!rec.bestLapTicks || l < rec.bestLapTicks)) rec.bestLapTicks = l;
  if (pb.newPbRace && r.raceTicks !== null) { (rec.bestRaceTicks ??= {})[r.mode] = r.raceTicks; if (r.mode === 'timeAttack' && r.splits.length) rec.splits = [...r.splits]; }
  if (r.mode === 'timeAttack' && r.finished) rec.runs = (rec.runs ?? 0) + 1;
  // stats + recent placements (Quick Match skill estimate, §6)
  accumulateStats(s.progress.stats, r, pb, ghostBeaten);
  if (r.mode !== 'timeAttack') s.progress.recent = [...(s.progress.recent ?? []), r.field > 1 ? (r.rank - 1) / (r.field - 1) : 0].slice(-10);
  // challenges
  const ch = applyChallenges(s, r, { timeAttackPB: pb.newPbRace && r.mode === 'timeAttack', ghostBeaten });
  const xpBase = raceXp(r, pb);
  const xpMid = r.mid?.done ? MID_REWARD.xp : 0;
  const xpTotal = xpBase + ch.xp + xpMid;
  const xpBefore = s.progress.xp, levelBefore = levelForXp(xpBefore);
  const xpAfter = xpBefore + xpTotal, levelAfter = levelForXp(xpAfter);
  const sparksBase = raceSparks(xpBase), sparksMid = r.mid?.done ? MID_REWARD.sparks : 0;
  const sparksLevelUp = (levelAfter - levelBefore) * LEVEL_UP_SPARKS;
  const sparksTotal = sparksBase + ch.sparks + sparksMid + sparksLevelUp;
  s.progress.xp = xpAfter;
  s.progress.level = levelAfter;
  s.progress.sparks += sparksTotal;
  const unlocked = unlockedBetween(levelBefore, levelAfter);
  if (unlocked.length) s.progress.fresh = [...new Set([...(s.progress.fresh ?? []), ...unlocked.map((u) => u.id)])];
  return {
    xpBase, xpChallenges: ch.xp, xpMid, xpTotal, sparksBase, sparksChallenges: ch.sparks, sparksMid, sparksLevelUp, sparksTotal,
    xpBefore, xpAfter, levelBefore, levelAfter, unlocked, challenges: ch.updates, mid: r.mid,
    pb: { lap: pb.newPbLaps > 0 && pb.prevBestLap !== null, race: pb.newPbRace && pb.prevBestRace !== null, prevRace: pb.prevBestRace }, ghostBeaten,
  };
}

/** Applies the race to the persistent save. */
export function applyRace(r: RaceSummary): RewardReport {
  let report: RewardReport | null = null;
  save.update((s) => { report = applyRaceTo(s, r); });
  return report!;
}
