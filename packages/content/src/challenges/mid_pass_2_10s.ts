import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'mid_pass_2_10s', code: 25, scope: 'midRace', metric: 'overtakesIn600', target: 2, reward: { xp: 30, sparks: 20 }, nameKey: 'challenges.mid_pass_2_10s' });
