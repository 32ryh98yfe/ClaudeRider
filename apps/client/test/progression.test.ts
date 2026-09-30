// Progression (13-modes-rules §10): XP formula, level table, Sparks, level-up bonus, unlock report.
import { describe, expect, it } from 'vitest';
import { cumulativeXp, levelForXp, levelProgress, raceSparks, raceXp, xpToNext, emptyStats, computePb, type RaceSummary } from '../src/meta/progression.ts';
import { applyRaceTo } from '../src/meta/rewards.ts';
import { migrateSave } from '../src/meta/save.ts';

function summary(p: Partial<RaceSummary> = {}): RaceSummary {
  return {
    mode: 'speed', teams: 'solo', trackId: 'meadow_loop', themeId: 'clayhill_village', laps: 3, finished: true, rank: 1, field: 8, teamWon: false, oneTwo: false, online: false,
    raceTicks: 6000, bestLapTicks: 1900, lapTicks: [2100, 2000, 1900], splits: [], stats: emptyStats(), ghostOn: false, mid: null, ...p,
  };
}

describe('level table (§10.2)', () => {
  it('matches the documented cumulative XP', () => {
    const table: [number, number][] = [[1, 0], [2, 100], [3, 225], [5, 550], [10, 1800], [20, 6175], [26, 10000], [30, 13050], [49, 33000], [50, 34300]];
    for (const [l, xp] of table) expect(cumulativeXp(l), `L${l}`).toBe(xp);
  });
  it('XP to next level is 100 + 25·(L − 1), capped at 50', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(25)).toBe(700);
    expect(xpToNext(49)).toBe(1300);
    expect(xpToNext(50)).toBe(Infinity);
    for (let l = 1; l < 50; l++) expect(cumulativeXp(l + 1) - cumulativeXp(l)).toBe(xpToNext(l));
  });
  it('levelForXp respects boundaries and the cap', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(34299)).toBe(49);
    expect(levelForXp(34300)).toBe(50);
    expect(levelForXp(1e9)).toBe(50);
    expect(levelProgress(150)).toEqual({ level: 2, into: 50, need: 125, frac: 0.4 });
  });
});

describe('race XP (§10.1)', () => {
  it('placement bonus per rank for a full field', () => {
    const bonus = [60, 45, 35, 28, 20, 14, 8, 4];
    for (let r = 1; r <= 8; r++) expect(raceXp({ mode: 'speed', finished: true, rank: r, field: 8, teamWon: false }, { newPbLaps: 0, newPbRace: false })).toBe(60 + bonus[r - 1]!);
  });
  it('unfinished, team win and PB laps', () => {
    expect(raceXp({ mode: 'item', finished: false, rank: 8, field: 8, teamWon: false }, { newPbLaps: 0, newPbRace: false })).toBe(15);
    expect(raceXp({ mode: 'speed', finished: true, rank: 2, field: 8, teamWon: true }, { newPbLaps: 2, newPbRace: false })).toBe(60 + 45 + 40 + 10);
  });
  it('smaller fields use the first N bonuses', () => {
    expect(raceXp({ mode: 'speed', finished: true, rank: 4, field: 4, teamWon: false }, { newPbLaps: 0, newPbRace: false })).toBe(60 + 28);
  });
  it('Time Attack: 30 per run + 5 per PB lap + 50 per PB race', () => {
    expect(raceXp({ mode: 'timeAttack', finished: true, rank: 1, field: 1, teamWon: false }, { newPbLaps: 2, newPbRace: true })).toBe(30 + 10 + 50);
    expect(raceXp({ mode: 'timeAttack', finished: false, rank: 1, field: 1, teamWon: false }, { newPbLaps: 0, newPbRace: false })).toBe(0);
  });
  it('Sparks are half the race XP, floored', () => {
    expect(raceSparks(121)).toBe(60);
    expect(raceSparks(0)).toBe(0);
  });
});

describe('applyRaceTo', () => {
  it('awards XP, Sparks, a 50-Spark bonus per level-up and reports unlocks', () => {
    const s = migrateSave({ v: 1 });
    s.progress.xp = 90; s.progress.level = 1;
    const now = new Date(2026, 8, 30, 12);
    const rep = applyRaceTo(s, summary({ rank: 1 }), now);
    expect(rep.levelBefore).toBe(1);
    expect(rep.xpBase).toBe(120 + 15); // 60 + 60 placement + 3 PB laps × 5 on the first run
    expect(rep.levelAfter).toBe(levelForXp(90 + rep.xpTotal));
    expect(rep.sparksLevelUp).toBe((rep.levelAfter - rep.levelBefore) * 50);
    expect(s.progress.sparks).toBe(rep.sparksTotal);
    expect(rep.unlocked.some((u) => u.id === 'livery.sparkle')).toBe(true); // level 2 reward
    expect(s.records.meadow_loop?.bestLapTicks).toBe(1900);
    expect(s.records.meadow_loop?.bestRaceTicks?.speed).toBe(6000);
    expect(s.progress.stats['races']).toBe(1);
    expect(s.progress.stats['wins']).toBe(1);
    expect(s.progress.stats['racesByTheme.clayhill_village']).toBe(1);
  });
  it('detects personal bests against stored records', () => {
    const s = migrateSave({ v: 1 });
    s.records.meadow_loop = { bestLapTicks: 1950, bestRaceTicks: { speed: 6100 } };
    const pb = computePb(s, summary({ lapTicks: [2000, 1940, 1930], raceTicks: 6050 }));
    expect(pb).toEqual({ newPbLaps: 2, newPbRace: true, prevBestRace: 6100, prevBestLap: 1950 });
  });
  it('mid-race missions add 30 XP / 20 Sparks when done', () => {
    const s = migrateSave({ v: 1 });
    const rep = applyRaceTo(s, summary({ mid: { id: 'mid_draft_2', done: true } }), new Date(2026, 8, 30));
    expect(rep.xpMid).toBe(30);
    expect(rep.sparksMid).toBe(20);
  });
});
