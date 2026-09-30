// FROZEN (contracts.lock). Canonical units & constants — see docs/design/01-decisions.md ADR-004.
export const TICK_HZ = 60;
export const DT = 1 / 60;
export const MAX_KARTS = 8;
export const V_REF = 34.0;
export const V_BOOST = 44.4;
export const G = 28;
export const KMH_PER_MPS = 5.4;
export type Tick = number;
/** Seconds → ticks. Config/bake time only (uses Math.round, exact). */
export const ticks = (sec: number): number => Math.round(sec * TICK_HZ);
