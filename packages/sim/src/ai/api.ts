// FROZEN interface (review-enforced, not hash-locked: AI_TIERS values are tuned in lane L3). AI driver API (docs/design/14-ai-spec.md). Trig is allowed under ai/.
import type { AiTier } from '@cr/content';
import type { InputFrame } from '../core/input.ts';
import type { WorldState } from '../core/state.ts';

export interface AiProfile {
  tier: AiTier;
  vMul: number;                       // ≤ 1 speed-cap multiplier (applied deterministically in sim via RaceConfig)
  lineNoise: number;                  // lateral target noise σ (m)
  driftSkill: number;                 // 0..1 (drift entry timing precision)
  instBoostRate: number;              // probability of executing an instant boost after a full drift
  instJitterTicks: number;            // ± jitter of the throttle tap
  reactionTicks: number;              // item/threat reaction delay
  mistakeRate: number;                // chance per corner of a late/overcooked entry
  startDelayTicks: readonly [number, number];
  falseStartProb: number;
  useDraft: boolean;
  aggression: number;                 // 0..1
  shortcutRisk: number;               // 0..1 (branch aiMinSkill threshold)
  itemSkill: 0 | 1 | 2 | 3;
  mashHz: number;
}

export const AI_TIERS: Readonly<Record<AiTier, AiProfile>> = {
  rookie: { tier: 'rookie', vMul: 0.93, lineNoise: 1.2, driftSkill: 0.45, instBoostRate: 0.15, instJitterTicks: 7, reactionTicks: 90, mistakeRate: 0.12, startDelayTicks: [18, 30], falseStartProb: 0.08, useDraft: false, aggression: 0.3, shortcutRisk: 0.2, itemSkill: 1, mashHz: 6 },
  racer: { tier: 'racer', vMul: 0.97, lineNoise: 0.7, driftSkill: 0.7, instBoostRate: 0.45, instJitterTicks: 4, reactionTicks: 45, mistakeRate: 0.06, startDelayTicks: [12, 24], falseStartProb: 0.04, useDraft: false, aggression: 0.5, shortcutRisk: 0.45, itemSkill: 2, mashHz: 8 },
  pro: { tier: 'pro', vMul: 1.0, lineNoise: 0.35, driftSkill: 0.9, instBoostRate: 0.8, instJitterTicks: 2, reactionTicks: 22, mistakeRate: 0.02, startDelayTicks: [0, 12], falseStartProb: 0.01, useDraft: true, aggression: 0.6, shortcutRisk: 0.75, itemSkill: 3, mashHz: 11 },
  legend: { tier: 'legend', vMul: 1.0, lineNoise: 0.1, driftSkill: 1.0, instBoostRate: 0.95, instJitterTicks: 1, reactionTicks: 10, mistakeRate: 0.0, startDelayTicks: [0, 5], falseStartProb: 0.0, useDraft: true, aggression: 0.7, shortcutRisk: 0.95, itemSkill: 3, mashHz: 14 },
};

export interface AiDriver {
  readonly slot: number;
  /** Decide the input for this kart given the current (authoritative) world. Called once per tick on the authority. */
  decide(w: Readonly<WorldState>, out: InputFrame): void;
}
