import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_attacks_5', code: 6, scope: 'daily', metric: 'attacksLanded', target: 5, filter: { mode: 'item' }, reward: { xp: 60, sparks: 40 }, nameKey: 'challenges.daily_attacks_5' });
