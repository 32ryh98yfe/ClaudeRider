import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_rails_10', code: 24, scope: 'weekly', metric: 'railsRidden', target: 10, reward: { xp: 180, sparks: 140 }, nameKey: 'challenges.weekly_rails_10' });
