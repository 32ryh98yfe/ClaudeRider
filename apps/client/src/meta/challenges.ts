// Daily (3) and weekly (5) challenges (13-modes-rules §11). Rotation is deterministic from hash32(dateKey, profileSeed);
// progress comes from RaceSummary; a completed challenge pays once.
import { loadContent, type ChallengeDef } from '@cr/content';
import type { ChallengeState, SaveV1 } from './save.ts';
import type { RaceSummary } from './progression.ts';

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 5;
/** Challenges that need a team race (not playable offline in v1): at most one per rotation. */
const TEAM_ONLY = new Set(['teamWins', 'oneTwos']);

export function challengeDefs(): readonly ChallengeDef[] { return loadContent().challenges; }
export function challengeDef(id: string): ChallengeDef | undefined { return challengeDefs().find((c) => c.id === id); }

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** Local calendar date key, e.g. 2026-09-30. */
export function dateKey(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
/** Key of the local week (its Monday). */
export function weekKey(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (m.getDay() + 6) % 7; // Monday = 0
  m.setDate(m.getDate() - dow);
  return dateKey(m);
}
/** Milliseconds until the next reset of `scope` (daily: next local midnight; weekly: next Monday 00:00). */
export function msUntilReset(scope: 'daily' | 'weekly', now: Date): number {
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (scope === 'weekly' ? 7 - dow : 1));
  return next.getTime() - now.getTime();
}

/** FNV-1a 32-bit hash of a string, mixed with a seed. */
export function hash32(s: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Picks the rotation for a scope: `count` distinct ids, deterministic per (key, seed). */
export function pickRotation(scope: 'daily' | 'weekly', key: string, seed: number, pool: readonly ChallengeDef[] = challengeDefs()): string[] {
  const cands = pool.filter((c) => c.scope === scope).map((c) => c.id).sort();
  const rnd = mulberry32(hash32(`${scope}:${key}`, seed));
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j]!, cands[i]!]; }
  const out: string[] = [];
  let team = 0;
  for (const id of cands) {
    const def = pool.find((c) => c.id === id)!;
    if (TEAM_ONLY.has(def.metric)) { if (team >= 1) continue; team++; }
    out.push(id);
    if (out.length >= (scope === 'daily' ? DAILY_COUNT : WEEKLY_COUNT)) break;
  }
  return out;
}

/** Rolls the daily/weekly lists over when their reset key changed. Returns true when the save changed. */
export function ensureRotation(s: SaveV1, now: Date = new Date()): boolean {
  const seed = s.profile.seed ?? 0;
  let changed = false;
  const dk = dateKey(now), wk = weekKey(now);
  const fresh = (ids: string[]): ChallengeState[] => ids.map((id) => ({ id, progress: 0, done: false, claimed: false }));
  if (s.challenges.dailyReset !== dk || s.challenges.daily.length === 0) { s.challenges.daily = fresh(pickRotation('daily', dk, seed)); s.challenges.dailyReset = dk; changed = true; }
  if (s.challenges.weeklyReset !== wk || s.challenges.weekly.length === 0) { s.challenges.weekly = fresh(pickRotation('weekly', wk, seed)); s.challenges.weeklyReset = wk; changed = true; }
  return changed;
}

/** How much one race advances a challenge (0 when the filter does not match). */
export function challengeGain(def: ChallengeDef, r: RaceSummary, extra: { timeAttackPB: boolean; ghostBeaten: boolean }): number {
  const f = def.filter;
  if (f?.mode && r.mode !== f.mode) return 0;
  if (f?.theme && r.themeId !== f.theme) return 0;
  if (f?.laps && r.laps !== f.laps) return 0;
  if (f?.top && !(r.finished && r.rank <= f.top && r.mode !== 'timeAttack')) return 0;
  const s = r.stats;
  switch (def.metric) {
    case 'finishes': return r.finished ? 1 : 0;
    case 'wins': return r.finished && r.rank === 1 && r.mode !== 'timeAttack' ? 1 : 0;
    case 'podiums': return r.finished && r.rank <= 3 && r.mode !== 'timeAttack' ? 1 : 0;
    case 'teamWins': return r.teams !== 'solo' && r.teamWon ? 1 : 0;
    case 'oneTwos': return r.oneTwo ? 1 : 0;
    case 'racesByTheme': return 1;
    case 'timeAttackPBs': return extra.timeAttackPB ? 1 : 0;
    case 'ghostsBeaten': return extra.ghostBeaten ? 1 : 0;
    default: return (s as unknown as Record<string, number>)[def.metric] ?? 0;
  }
}

export interface ChallengeUpdate { id: string; scope: 'daily' | 'weekly'; before: number; after: number; target: number; justDone: boolean; reward: { xp: number; sparks: number } }

/** Applies one race to the current rotations; completed challenges are claimed (paid) once. */
export function applyChallenges(s: SaveV1, r: RaceSummary, extra: { timeAttackPB: boolean; ghostBeaten: boolean }): { updates: ChallengeUpdate[]; xp: number; sparks: number } {
  const updates: ChallengeUpdate[] = [];
  let xp = 0, sparks = 0;
  for (const scope of ['daily', 'weekly'] as const) {
    for (const st of s.challenges[scope]) {
      const def = challengeDef(st.id);
      if (!def) continue;
      const before = st.progress;
      if (!st.done) {
        const g = challengeGain(def, r, extra);
        st.progress = Math.min(def.target, st.progress + g);
        if (st.progress >= def.target) st.done = true;
      }
      const justDone = st.done && !st.claimed;
      if (justDone) { st.claimed = true; xp += def.reward.xp; sparks += def.reward.sparks; }
      if (st.progress !== before || justDone) updates.push({ id: st.id, scope, before, after: st.progress, target: def.target, justDone, reward: def.reward });
    }
  }
  return { updates, xp, sparks };
}
