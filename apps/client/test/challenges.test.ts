// Challenges (13-modes-rules §11): 34 definitions, deterministic rotation per date, progress from race summaries, pays once.
import { describe, expect, it } from 'vitest';
import { loadContent } from '@cr/content';
import { applyChallenges, challengeDefs, challengeGain, dateKey, ensureRotation, msUntilReset, pickRotation, weekKey } from '../src/meta/challenges.ts';
import { emptyStats, type RaceSummary } from '../src/meta/progression.ts';
import { migrateSave } from '../src/meta/save.ts';
import { allKeys } from '../src/i18n/index.ts';

const race = (p: Partial<RaceSummary> = {}): RaceSummary => ({
  mode: 'speed', teams: 'solo', trackId: 'meadow_loop', themeId: 'clayhill_village', laps: 3, finished: true, rank: 2, field: 8, teamWon: false, oneTwo: false, online: false,
  raceTicks: 6000, bestLapTicks: 1900, lapTicks: [], splits: [], stats: emptyStats(), ghostOn: false, mid: null, ...p,
});
const none = { timeAttackPB: false, ghostBeaten: false };

describe('challenge pool', () => {
  it('has 12 daily, 12 weekly and 10 mid-race definitions with unique ids and codes', () => {
    const defs = loadContent().challenges;
    expect(defs.filter((d) => d.scope === 'daily')).toHaveLength(12);
    expect(defs.filter((d) => d.scope === 'weekly')).toHaveLength(12);
    expect(defs.filter((d) => d.scope === 'midRace')).toHaveLength(10);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    expect(new Set(defs.map((d) => d.code)).size).toBe(defs.length);
  });
  it('every challenge has a name in both locales', () => {
    const ko = new Set(allKeys('ko')), en = new Set(allKeys('en'));
    for (const d of challengeDefs()) { expect(ko.has(d.nameKey), d.nameKey).toBe(true); expect(en.has(d.nameKey), d.nameKey).toBe(true); }
  });
});

describe('rotation (§11.1)', () => {
  it('uses local dates and Monday weeks', () => {
    const wed = new Date(2026, 8, 30, 15, 0);
    expect(dateKey(wed)).toBe('2026-09-30');
    expect(weekKey(wed)).toBe('2026-09-28');
    expect(weekKey(new Date(2026, 9, 4, 23))).toBe('2026-09-28'); // Sunday
    expect(weekKey(new Date(2026, 9, 5, 0, 1))).toBe('2026-10-05'); // Monday
    expect(msUntilReset('daily', wed)).toBe(9 * 3600 * 1000);
    expect(msUntilReset('weekly', wed)).toBe((4 * 24 + 9) * 3600 * 1000);
  });
  it('is deterministic per (date, seed), distinct and sized 3 / 5', () => {
    const a = pickRotation('daily', '2026-09-30', 1234), b = pickRotation('daily', '2026-09-30', 1234);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    const w = pickRotation('weekly', '2026-09-28', 1234);
    expect(w).toHaveLength(5);
    expect(new Set(w).size).toBe(5);
    const days = new Set<string>();
    for (let d = 1; d <= 20; d++) days.add(pickRotation('daily', `2026-10-${String(d).padStart(2, '0')}`, 1234).join());
    expect(days.size).toBeGreaterThan(10);
  });
  it('holds at most one team-only challenge per rotation', () => {
    for (let s = 0; s < 200; s++) {
      const w = pickRotation('weekly', '2026-09-28', s);
      expect(w.filter((id) => id === 'weekly_team_win_3' || id === 'weekly_onetwo_1').length).toBeLessThanOrEqual(1);
    }
  });
  it('ensureRotation rolls over when the key changes', () => {
    const s = migrateSave({ v: 1, profile: { seed: 7 } });
    expect(ensureRotation(s, new Date(2026, 8, 30))).toBe(true);
    expect(s.challenges.daily).toHaveLength(3);
    expect(s.challenges.weekly).toHaveLength(5);
    expect(ensureRotation(s, new Date(2026, 8, 30, 23))).toBe(false);
    expect(ensureRotation(s, new Date(2026, 9, 1))).toBe(true);
    expect(s.challenges.dailyReset).toBe('2026-10-01');
  });
});

describe('progress (§11)', () => {
  const def = (id: string) => challengeDefs().find((c) => c.id === id)!;
  it('reads metrics and filters', () => {
    expect(challengeGain(def('daily_finish_3'), race(), none)).toBe(1);
    expect(challengeGain(def('daily_finish_3'), race({ finished: false }), none)).toBe(0);
    expect(challengeGain(def('daily_drift_3000'), race({ stats: { ...emptyStats(), driftMeters: 812 } }), none)).toBe(812);
    expect(challengeGain(def('daily_attacks_5'), race({ mode: 'speed', stats: { ...emptyStats(), attacksLanded: 3 } }), none)).toBe(0);
    expect(challengeGain(def('daily_attacks_5'), race({ mode: 'item', stats: { ...emptyStats(), attacksLanded: 3 } }), none)).toBe(3);
    expect(challengeGain(def('daily_podium_1'), race({ rank: 3 }), none)).toBe(1);
    expect(challengeGain(def('daily_podium_1'), race({ rank: 4 }), none)).toBe(0);
    expect(challengeGain(def('weekly_2lap_top3'), race({ rank: 2, laps: 3 }), none)).toBe(0);
    expect(challengeGain(def('weekly_2lap_top3'), race({ rank: 2, laps: 2 }), none)).toBe(1);
    expect(challengeGain(def('daily_theme_clay'), race({ themeId: 'sunstone_desert' }), none)).toBe(0);
    expect(challengeGain(def('weekly_ta_pb_3'), race({ mode: 'timeAttack' }), { timeAttackPB: true, ghostBeaten: false })).toBe(1);
  });
  it('completes, caps at the target and pays exactly once', () => {
    const s = migrateSave({ v: 1 });
    s.challenges.daily = [{ id: 'daily_finish_3', progress: 2, done: false, claimed: false }];
    s.challenges.weekly = [];
    const first = applyChallenges(s, race(), none);
    expect(first.xp).toBe(60);
    expect(first.sparks).toBe(40);
    expect(s.challenges.daily[0]).toEqual({ id: 'daily_finish_3', progress: 3, done: true, claimed: true });
    const again = applyChallenges(s, race(), none);
    expect(again.xp).toBe(0);
    expect(again.updates).toHaveLength(0);
    expect(s.challenges.daily[0]!.progress).toBe(3);
  });
});
