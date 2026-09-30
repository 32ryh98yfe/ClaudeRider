import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_draft_5', code: 9, scope: 'daily', metric: 'draftActivations', target: 5, reward: { xp: 50, sparks: 35 }, nameKey: 'challenges.daily_draft_5' });
