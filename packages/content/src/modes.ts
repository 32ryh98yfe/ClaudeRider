import type { ModeRules } from './schema/index.ts';

// ADR-008.
export const MODE_RULES: ModeRules = {
  retireTicks: 600,
  teamPoints: [10, 8, 6, 5, 4, 3, 2, 1],
  introTicks: 240,
  gridTicks: 90,
  countdownBeatTicks: 60,
  resultsSec: 12,
  aiTiers: ['rookie', 'racer', 'pro', 'legend'],
};
