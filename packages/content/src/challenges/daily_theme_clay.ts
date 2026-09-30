import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'daily_theme_clay', code: 11, scope: 'daily', metric: 'racesByTheme', target: 2, filter: { theme: 'clayhill_village' }, reward: { xp: 40, sparks: 30 }, nameKey: 'challenges.daily_theme_clay' });
