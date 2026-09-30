// Kart bodies (10-sim-spec §3, ADR-004): every body stays within ±1% of its archetype on every handling stat.
// Weight is exempt (tugboat is the declared heavy balance body, ADR-004); lap-time spread is checked in balance.test.
import { describe, expect, it } from 'vitest';
import { getContent } from './rig.ts';

const ARCH = {
  speed: { vGrip: 34.4, vBoost: 45.0, a0: 16.5, tBoostTicks: 186, g0: 0.64, kLatIn: 2.8, kLatNeutral: 5.2, yGrip: 1.5, cBeta: 0.85 },
  balance: { vGrip: 34.0, vBoost: 44.4, a0: 18, tBoostTicks: 180, g0: 0.7, kLatIn: 3.0, kLatNeutral: 5.5, yGrip: 1.55, cBeta: 0.8 },
  drift: { vGrip: 33.6, vBoost: 43.8, a0: 19.5, tBoostTicks: 174, g0: 0.77, kLatIn: 3.3, kLatNeutral: 5.9, yGrip: 1.6, cBeta: 0.75 },
} as const;

describe('kart bodies vs archetypes (ADR-004 ±1%)', () => {
  const karts = getContent().karts.all;
  it('all 8 bodies are registered', () => expect(karts.length).toBe(8));
  it.each(karts.map((k) => [k.id, k] as const))('%s is within ±1% of its archetype', (_id, k) => {
    const a = ARCH[k.archetype];
    for (const key of Object.keys(a) as (keyof typeof a)[]) {
      const dev = Math.abs(k[key] / a[key] - 1);
      expect(dev, `${k.id}.${key} = ${k[key]} vs ${a[key]}`).toBeLessThanOrEqual(0.01 + 1e-9);
    }
  });
});
