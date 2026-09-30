// Public surface of the AI lane (import from '@cr/sim/ai/index.ts'; B8 names stay exported from '@cr/sim').
export * from './api.ts';
export { createAiDriver, DriftPlan, Mistake, type AiDriverEx, type AiDriverStats } from './driver.ts';
export * from './hooks.ts';
export * from './profiles.ts';
export * from './identity.ts';
export * from './takeover.ts';
export * from './lookahead.ts';
export { planFor, gripSpeedFor, type TrackPlan, type PathPlan, type Corner } from './plan.ts';
export { relaxRacingLine } from './line.ts';
export { RecoveryMode } from './recovery.ts';
export { AiRng, mixSeed, hashUnit } from './rng.ts';
