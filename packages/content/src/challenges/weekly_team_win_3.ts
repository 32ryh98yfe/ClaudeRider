import { defineChallenge } from '../define.ts';

// 13-modes-rules §11 (L10). Codes are local-only (challenges never go on the wire).
export default defineChallenge({ id: 'weekly_team_win_3', code: 22, scope: 'weekly', metric: 'teamWins', target: 3, reward: { xp: 250, sparks: 200 }, nameKey: 'challenges.weekly_team_win_3' });
