// Tier profile × character personality → the effective parameters one bot drives with (14-ai §2, §8).
// Tiers differ by execution, not only by vMul: the AiExecution table below holds the per-tier knobs that
// the frozen AiProfile does not carry (brake points, booster discipline, lane-choice latency, …).
import type { AiTier, CharacterId, ContentTables } from '@cr/content';
import type { AiProfile } from './api.ts';
import { AI_TIERS } from './api.ts';
import type { AiRng } from './rng.ts';

export type DriftStyle = 'long' | 'chain' | 'neutral';

/** Character driving personality (content `CharacterMeta.personality`, 14-ai §8). */
export interface AiPersonality {
  aggression: number;   // 0..1, scales the tier aggression by (0.5 + a)
  lineBias: number;     // −1..1, + = wide (outside) lines, − = inside
  risk: number;         // 0..1, corner speed ±1%, shortcuts, jump/rail boldness
  consistency: number;  // ~0.7..1.3, divides line noise and mistake rate
  driftStyle: DriftStyle;
  itemHoarding: number; // 0..1, read by the item policy (L2)
}

/** Neutral personality: leaves the tier profile unchanged. */
export const NEUTRAL_PERSONALITY: Readonly<AiPersonality> = Object.freeze({ aggression: 0.5, lineBias: 0, risk: 0.5, consistency: 1, driftStyle: 'neutral', itemHoarding: 0.5 });

/** Per-tier execution knobs (tuned with tools/balance/tiers.ts against the ADR-009 pace targets). */
export interface AiExecution {
  /** × baked vLim: where the bot brakes for corners (1 = on the limit). */
  cornerSpeedMul: number;
  /** × grip-plan corner speed (corners taken without drifting). */
  gripSpeedMul: number;
  /** Sloppy drift plan: trigger this many metres late [min, max]. */
  sloppyLateM: readonly [number, number];
  /** Sloppy drift plan: counter-steer this many ticks late [min, max]. */
  sloppyHoldTicks: readonly [number, number];
  /** 0 fires boosters as soon as it notices them, 1 waits for low curvature, 2 also wants a long straight, 3 also chains and keeps a reserve. */
  boostSkill: 0 | 1 | 2 | 3;
  /** Hesitation before using a fresh booster [min, max] ticks. */
  boostDelayTicks: readonly [number, number];
  /** How much of the baked racing line the bot uses (0 = centreline driver, 1 = full line). */
  lineTrack: number;
  /** Lane choice (avoidance) re-evaluation period in ticks. */
  laneEvalTicks: number;
  /** Time-to-collision horizon of the avoidance cone (s). */
  ttcHorizon: number;
  /** Late-brake mistake length (ticks of braking skipped). */
  mistakeLateTicks: number;
  /** Over-held-drift mistake length (ticks of counter-steer skipped). */
  mistakeHoldTicks: number;
  /** Panic-brake mistake length [min, max] ticks (corners that need no braking). */
  panicBrakeTicks: readonly [number, number];
  /** Share of long corners chopped into chained short drifts (cut and re-drift, an instant boost per cut)
   *  instead of one held drift. Holding is faster on long corners; the 'chain' drift style chops anyway. */
  chainRate: number;
  /** A grip (no-drift) plan is only rolled where grip speed ≥ this share of the drift speed; tighter corners
   *  get a sloppy drift instead (nobody grips a hairpin on purpose). */
  gripViable: number;
}

export const AI_EXECUTION: Readonly<Record<AiTier, AiExecution>> = {
  rookie: { cornerSpeedMul: 0.88, gripSpeedMul: 0.93, sloppyLateM: [4, 10], sloppyHoldTicks: [6, 15], boostSkill: 0, boostDelayTicks: [30, 150], lineTrack: 0.4, laneEvalTicks: 12, ttcHorizon: 0.9, mistakeLateTicks: 20, mistakeHoldTicks: 20, panicBrakeTicks: [12, 24], chainRate: 0, gripViable: 0.8 },
  racer: { cornerSpeedMul: 0.95, gripSpeedMul: 0.96, sloppyLateM: [4, 9], sloppyHoldTicks: [6, 12], boostSkill: 1, boostDelayTicks: [10, 60], lineTrack: 0.75, laneEvalTicks: 9, ttcHorizon: 1.2, mistakeLateTicks: 18, mistakeHoldTicks: 20, panicBrakeTicks: [10, 20], chainRate: 0, gripViable: 0.85 },
  pro: { cornerSpeedMul: 0.99, gripSpeedMul: 0.99, sloppyLateM: [3, 7], sloppyHoldTicks: [5, 10], boostSkill: 2, boostDelayTicks: [0, 12], lineTrack: 1, laneEvalTicks: 6, ttcHorizon: 1.5, mistakeLateTicks: 18, mistakeHoldTicks: 20, panicBrakeTicks: [8, 16], chainRate: 0, gripViable: 0.9 },
  legend: { cornerSpeedMul: 1.0, gripSpeedMul: 1.0, sloppyLateM: [2, 5], sloppyHoldTicks: [4, 8], boostSkill: 3, boostDelayTicks: [0, 3], lineTrack: 1, laneEvalTicks: 6, ttcHorizon: 1.6, mistakeLateTicks: 18, mistakeHoldTicks: 20, panicBrakeTicks: [6, 12], chainRate: 0, gripViable: 0.9 },
};

/** Noise-free Legend used for reference laps ("Legend ghost", 14-ai §2): σ 0, every drift optimal, every instant boost, no mistakes. */
export const AI_GHOST_PROFILE: Readonly<AiProfile> = Object.freeze({
  ...AI_TIERS.legend, lineNoise: 0, driftSkill: 1, instBoostRate: 1, instJitterTicks: 0, reactionTicks: 0, mistakeRate: 0,
  startDelayTicks: [0, 0] as const, falseStartProb: 0,
});

/** Everything one bot drives with. Built once per driver; read-only afterwards. */
export interface EffectiveProfile extends AiProfile {
  exec: AiExecution;
  personality: AiPersonality;
  /** Corner-speed multiplier from risk (×vLim). */
  riskSpeedMul: number;
  /** Lateral line bias as a fraction of the usable half-width (+ = outside of the next corner). */
  lineBiasFrac: number;
  /** shortcutRisk × personality (14-ai §4.1), clamped to 1. */
  shortcutRiskEff: number;
  /** True for the noise-free reference driver. */
  ghost: boolean;
}

const NEXT_TIER: Readonly<Record<AiTier, AiTier | null>> = { rookie: 'racer', racer: 'pro', pro: 'legend', legend: null };
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Resolves a character personality from an id or an explicit object (missing ids → neutral, never a crash). */
export function personalityOf(content: ContentTables | null, c: AiPersonality | CharacterId | undefined): AiPersonality {
  if (!c) return NEUTRAL_PERSONALITY;
  if (typeof c === 'string') {
    const cm = content?.characters.byId.get(c);
    return cm ? cm.personality : NEUTRAL_PERSONALITY;
  }
  return c;
}

/**
 * Tier profile (+ explicit AiProfile overrides) × personality × seeded per-bot jitter (±5% on driftSkill,
 * instBoostRate and lineNoise, 14-ai §2). `rng` may be null for jitter-free profiles (ghost, tests).
 */
export function resolveProfile(base: AiProfile, overrides: Partial<AiProfile>, pers: AiPersonality, rng: AiRng | null, ghost = false): EffectiveProfile {
  const p: AiProfile = { ...base, ...pickProfile(overrides) };
  const exec = AI_EXECUTION[p.tier] ?? AI_EXECUTION.pro;
  const j = (x: number): number => (rng ? x * (1 + 0.05 * (2 * rng.next() - 1)) : x);
  const c = pers.consistency > 0.2 ? pers.consistency : 0.2;
  let inst = j(p.instBoostRate);
  if (pers.driftStyle === 'chain') {
    const nt = NEXT_TIER[p.tier];
    const cap = nt ? AI_TIERS[nt].instBoostRate : 1;
    inst = Math.min(Math.max(inst, inst + 0.05 > cap ? cap : inst + 0.05), 1);
  }
  const aggressionScaled = 'aggression' in overrides ? p.aggression : clamp01(p.aggression * (0.5 + pers.aggression));
  return {
    ...p,
    vMul: Math.min(1, p.vMul),
    lineNoise: ghost ? 0 : j(p.lineNoise) / c,
    driftSkill: ghost ? 1 : clamp01(j(p.driftSkill)),
    instBoostRate: ghost ? 1 : clamp01(inst),
    mistakeRate: ghost ? 0 : p.mistakeRate / c,
    aggression: aggressionScaled,
    exec,
    personality: pers,
    riskSpeedMul: ghost ? 1 : 1 + 0.02 * (pers.risk - 0.5),
    lineBiasFrac: ghost ? 0 : 0.3 * pers.lineBias,
    shortcutRiskEff: clamp01(p.shortcutRisk * (0.6 + 0.8 * pers.risk)),
    ghost,
  };
}

/** Copies only real AiProfile keys (the personality argument may carry driver extras too). */
function pickProfile(o: Partial<AiProfile>): Partial<AiProfile> {
  const out: Partial<AiProfile> = {};
  const src = o as Record<string, unknown>, dst = out as Record<string, unknown>;
  for (const key of PROFILE_KEYS) if (src[key] !== undefined) dst[key] = src[key];
  return out;
}

const PROFILE_KEYS: readonly (keyof AiProfile)[] = [
  'tier', 'vMul', 'lineNoise', 'driftSkill', 'instBoostRate', 'instJitterTicks', 'reactionTicks', 'mistakeRate', 'startDelayTicks',
  'falseStartProb', 'useDraft', 'aggression', 'shortcutRisk', 'itemSkill', 'mashHz',
];
