import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'mid_block_1', code: 32, scope: 'midRace', metric: 'attacksBlocked', target: 1, filter: { mode: 'item' }, reward: { xp: 30, sparks: 20 }, nameKey: 'challenges.mid_block_1' });
