import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'mid_draft_2', code: 28, scope: 'midRace', metric: 'draftActivations', target: 2, reward: { xp: 30, sparks: 20 }, nameKey: 'challenges.mid_draft_2' });
