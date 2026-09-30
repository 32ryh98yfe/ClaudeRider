import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_ta_pb_3', code: 20, scope: 'weekly', metric: 'timeAttackPBs', target: 3, filter: { mode: 'timeAttack' }, reward: { xp: 200, sparks: 150 }, nameKey: 'challenges.weekly_ta_pb_3' });
