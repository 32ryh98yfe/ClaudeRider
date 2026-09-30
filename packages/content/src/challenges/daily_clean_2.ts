import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_clean_2', code: 10, scope: 'daily', metric: 'cleanLaps', target: 2, reward: { xp: 50, sparks: 35 }, nameKey: 'challenges.daily_clean_2' });
