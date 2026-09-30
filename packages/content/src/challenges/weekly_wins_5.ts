import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_wins_5', code: 14, scope: 'weekly', metric: 'wins', target: 5, reward: { xp: 250, sparks: 200 }, nameKey: 'challenges.weekly_wins_5' });
