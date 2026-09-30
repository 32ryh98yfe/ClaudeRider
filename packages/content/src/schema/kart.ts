import type { KartBodyId } from '../ids.ts';

/** Physics spec of a kart body (ADR-004 archetypes). All values SI; durations in ticks. */
export interface KartSpec {
  id: KartBodyId;
  code: number;
  archetype: 'speed' | 'balance' | 'drift';
  vGrip: number;        // m/s grip top speed
  vBoost: number;       // m/s boost cap
  a0: number;           // m/s² base acceleration
  tBoostTicks: number;  // gauge booster duration
  g0: number;           // gauge charge coefficient
  kLatIn: number;       // drift lateral damping, steering into the drift
  kLatNeutral: number;  // drift lateral damping, neutral steer
  yGrip: number;        // grip yaw gain
  cBeta: number;        // drift drag coefficient
  weight: number;       // kart-kart contact mass (0.85..1.2)
  nameKey: string;      // i18n key, e.g. 'karts.pebble.name'
  unlockLevel: number;  // Racer Level needed (1 = starter)
}
