import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_onetwo_1', code: 23, scope: 'weekly', metric: 'oneTwos', target: 1, filter: { mode: 'speed' }, reward: { xp: 250, sparks: 200 }, nameKey: 'challenges.weekly_onetwo_1' });
