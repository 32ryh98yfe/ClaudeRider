import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_finish_3', code: 1, scope: 'daily', metric: 'finishes', target: 3, reward: { xp: 60, sparks: 40 }, nameKey: 'challenges.daily_finish_3' });
