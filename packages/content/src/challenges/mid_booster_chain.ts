import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'mid_booster_chain', code: 30, scope: 'midRace', metric: 'boosterChain', target: 1, filter: { mode: 'speed' }, reward: { xp: 30, sparks: 20 }, nameKey: 'challenges.mid_booster_chain' });
