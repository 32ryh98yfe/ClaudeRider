import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_drift_25000', code: 15, scope: 'weekly', metric: 'driftMeters', target: 25000, reward: { xp: 200, sparks: 150 }, nameKey: 'challenges.weekly_drift_25000' });
