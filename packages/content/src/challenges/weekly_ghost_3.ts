import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_ghost_3', code: 21, scope: 'weekly', metric: 'ghostsBeaten', target: 3, filter: { mode: 'timeAttack' }, reward: { xp: 200, sparks: 150 }, nameKey: 'challenges.weekly_ghost_3' });
