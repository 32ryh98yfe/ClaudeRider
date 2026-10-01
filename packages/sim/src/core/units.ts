// FROZEN (contracts.lock). Canonical units & constants — see docs/design/01-decisions.md ADR-004.
export const TICK_HZ = 60;
export const DT = 1 / 60;
export const MAX_KARTS = 8;
export const V_REF = 34.0;
export const V_BOOST = 45.11;   // reads 272 km/h (Balance body)
export const G = 28;
export const KMH_PER_MPS = 205 / 34; // display: V_REF 34 m/s reads 205 km/h (M5; was 5.4 = gap-2 scale)
export type Tick = number;
/** Seconds → ticks. Config/bake time only (uses Math.round, exact). */
export const ticks = (sec: number): number => Math.round(sec * TICK_HZ);
