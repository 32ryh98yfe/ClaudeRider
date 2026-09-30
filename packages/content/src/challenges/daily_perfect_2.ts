import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_perfect_2', code: 3, scope: 'daily', metric: 'perfectStarts', target: 2, reward: { xp: 50, sparks: 35 }, nameKey: 'challenges.daily_perfect_2' });
