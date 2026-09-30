import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_drift_3000', code: 2, scope: 'daily', metric: 'driftMeters', target: 3000, reward: { xp: 60, sparks: 40 }, nameKey: 'challenges.daily_drift_3000' });
