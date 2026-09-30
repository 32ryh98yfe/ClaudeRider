import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'mid_instant_chain_3', code: 26, scope: 'midRace', metric: 'instantChain', target: 3, reward: { xp: 30, sparks: 20 }, nameKey: 'challenges.mid_instant_chain_3' });
