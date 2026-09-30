import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_shortcut_3', code: 12, scope: 'daily', metric: 'shortcutsTaken', target: 3, reward: { xp: 50, sparks: 35 }, nameKey: 'challenges.daily_shortcut_3' });
