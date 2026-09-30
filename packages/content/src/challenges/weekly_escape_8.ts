import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_escape_8', code: 18, scope: 'weekly', metric: 'trapsEscapedFast', target: 8, filter: { mode: 'item' }, reward: { xp: 180, sparks: 140 }, nameKey: 'challenges.weekly_escape_8' });
