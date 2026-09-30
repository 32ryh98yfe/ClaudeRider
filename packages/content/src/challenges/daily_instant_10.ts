import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_instant_10', code: 4, scope: 'daily', metric: 'instantBoosts', target: 10, reward: { xp: 50, sparks: 35 }, nameKey: 'challenges.daily_instant_10' });
