import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_podium_1', code: 8, scope: 'daily', metric: 'podiums', target: 1, filter: { top: 3 }, reward: { xp: 70, sparks: 50 }, nameKey: 'challenges.daily_podium_1' });
