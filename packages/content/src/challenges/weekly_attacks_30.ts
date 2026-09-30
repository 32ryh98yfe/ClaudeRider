import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_attacks_30', code: 16, scope: 'weekly', metric: 'attacksLanded', target: 30, filter: { mode: 'item' }, reward: { xp: 220, sparks: 170 }, nameKey: 'challenges.weekly_attacks_30' });
