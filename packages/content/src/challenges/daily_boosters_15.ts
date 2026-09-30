import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_boosters_15', code: 5, scope: 'daily', metric: 'boostersUsed', target: 15, filter: { mode: 'speed' }, reward: { xp: 50, sparks: 35 }, nameKey: 'challenges.daily_boosters_15' });
