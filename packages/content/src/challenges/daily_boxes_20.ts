import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_boxes_20', code: 7, scope: 'daily', metric: 'itemBoxes', target: 20, filter: { mode: 'item' }, reward: { xp: 40, sparks: 30 }, nameKey: 'challenges.daily_boxes_20' });
