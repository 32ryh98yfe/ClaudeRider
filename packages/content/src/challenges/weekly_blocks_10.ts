import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_blocks_10', code: 17, scope: 'weekly', metric: 'attacksBlocked', target: 10, filter: { mode: 'item' }, reward: { xp: 200, sparks: 150 }, nameKey: 'challenges.weekly_blocks_10' });
