import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'mid_top3_lap_end', code: 33, scope: 'midRace', metric: 'top3LapEnd', target: 1, reward: { xp: 30, sparks: 20 }, nameKey: 'challenges.mid_top3_lap_end' });
