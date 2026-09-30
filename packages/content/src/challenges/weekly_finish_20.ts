import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_finish_20', code: 13, scope: 'weekly', metric: 'finishes', target: 20, reward: { xp: 200, sparks: 150 }, nameKey: 'challenges.weekly_finish_20' });
