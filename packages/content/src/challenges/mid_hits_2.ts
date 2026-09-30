import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'mid_hits_2', code: 31, scope: 'midRace', metric: 'attacksLanded', target: 2, filter: { mode: 'item' }, reward: { xp: 30, sparks: 20 }, nameKey: 'challenges.mid_hits_2' });
