import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_2lap_top3', code: 19, scope: 'weekly', metric: 'podiums', target: 3, filter: { laps: 2, top: 3 }, reward: { xp: 220, sparks: 170 }, nameKey: 'challenges.weekly_2lap_top3' });
