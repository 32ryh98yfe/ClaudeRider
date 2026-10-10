// Kart bodies (10-sim-spec §3, ADR-004): every body stays within ±1% of its archetype on every handling stat.
// Weight is exempt (tugboat is the declared heavy balance body, ADR-004); lap-time spread is checked in balance.test.
import { describe, expect, it } from 'vitest';
import { getContent } from './rig.ts';

// vBoost ×(45.11/44.4) in M5 (doc 15 §1): the booster plateau reads 272 km/h on Balance
// Doc 17 scales each archetype's gauge coefficient by 1.1/0.7, preserving every
// body's relative handling deviation and this test's original ±1% acceptance.
const GAUGE_SCALE = 1.1 / 0.7;
const SCALE: Record<string, number> = { vGrip: 0.85, vBoost: 0.85 ** 2, a0: 0.85, kLatIn: 4, kLatNeutral: 12 / 5.5, cBeta: 13.75 };
const ARCH = {
  speed: { vGrip: 34.4, vBoost: 45.72, a0: 16.5, tBoostTicks: 186, g0: 0.64 * GAUGE_SCALE, kLatIn: 2.8, kLatNeutral: 5.2, yGrip: 1.5, cBeta: 0.85 },
  balance: { vGrip: 34.0, vBoost: 45.11, a0: 18, tBoostTicks: 180, g0: 0.7 * GAUGE_SCALE, kLatIn: 3.0, kLatNeutral: 5.5, yGrip: 1.55, cBeta: 0.8 },
  drift: { vGrip: 33.6, vBoost: 44.50, a0: 19.5, tBoostTicks: 174, g0: 0.77 * GAUGE_SCALE, kLatIn: 3.3, kLatNeutral: 5.9, yGrip: 1.6, cBeta: 0.75 },
} as const;

describe('kart bodies vs archetypes (ADR-004 ±1%)', () => {
  const karts = getContent().karts.all;
  it('all 8 bodies are registered', () => expect(karts.length).toBe(8));
  it.each(karts.map((k) => [k.id, k] as const))('%s is within ±1% of its archetype', (_id, k) => {
    const a = ARCH[k.archetype];
    for (const key of Object.keys(a) as (keyof typeof a)[]) {
      const target = a[key] * (SCALE[key] ?? 1);
      const dev = Math.abs(k[key] / target - 1);
      expect(dev, `${k.id}.${key} = ${k[key]} vs ${a[key]}`).toBeLessThanOrEqual(0.01 + 1e-9);
    }
  });
});
