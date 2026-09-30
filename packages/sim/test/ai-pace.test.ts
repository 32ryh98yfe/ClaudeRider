// Tier pace bands (ADR-009, 14-ai §2): solo race pace of each tier vs the noise-free Legend ghost, through the
// 8-tick lookahead a RaceRoom uses, averaged over the 12 characters (their personalities and drift styles). The tiers differ by execution only
// (vMul ≤ 1). meadow_loop is the reference track for all four tiers; on proving_ring (a 700 m oval whose pace is
// mostly instant boosts, see docs/design/contract-requests/L3-ai-pace.md) Pro and Legend hold their band.
// `node tools/balance/tiers.ts` prints the full table for every baked track and all 12 characters.
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, type AiTier } from '@cr/content';
import { ghostRaceSec, soloPace, PACE_BANDS } from '../src/ai/balance.ts';
import { bakedTrack, getContent } from './rig.ts';

const LA = 8;
const CHARS = CHARACTER_IDS;
const SEED = 1000;

function tierPace(rel: string, tiers: readonly AiTier[]): Map<AiTier, number> {
  const track = bakedTrack(rel), content = getContent();
  const ref = ghostRaceSec(track, content, undefined, LA);
  const out = new Map<AiTier, number>();
  for (const tier of tiers) {
    let sum = 0, n = 0;
    for (const c of CHARS) {
      const r = soloPace(track, content, tier, c, SEED + CHARS.indexOf(c), ref, undefined, LA);
      expect(r.kart.finished, `${tier} ${c} finished`).toBe(true);
      sum += r.pace; n++;
    }
    out.set(tier, sum / n);
  }
  return out;
}

describe('AI tier pace vs the Legend ghost', () => {
  it('meadow_loop: every tier inside its band, in tier order', () => {
    const p = tierPace('clayhill_village/meadow_loop', ['rookie', 'racer', 'pro', 'legend']);
    console.log('meadow_loop pace', [...p].map(([t, v]) => `${t} ${(v * 100).toFixed(1)}%`).join(', '));
    for (const [tier, v] of p) {
      const b = PACE_BANDS[tier];
      expect(v, `${tier} ${(v * 100).toFixed(1)}% vs ${b.target}`).toBeGreaterThanOrEqual(b.lo);
      expect(v, `${tier} ${(v * 100).toFixed(1)}% vs ${b.target}`).toBeLessThanOrEqual(b.hi);
    }
    expect(p.get('rookie')!).toBeLessThan(p.get('racer')!);
    expect(p.get('racer')!).toBeLessThan(p.get('pro')!);
    expect(p.get('pro')!).toBeLessThan(p.get('legend')!);
  });

  it('proving_ring: Pro and Legend inside their bands', () => {
    const p = tierPace('spark_circuit/proving_ring', ['pro', 'legend']);
    console.log('proving_ring pace', [...p].map(([t, v]) => `${t} ${(v * 100).toFixed(1)}%`).join(', '));
    for (const [tier, v] of p) {
      const b = PACE_BANDS[tier];
      expect(v, `${tier} ${(v * 100).toFixed(1)}% vs ${b.target}`).toBeGreaterThanOrEqual(b.lo);
      expect(v, `${tier} ${(v * 100).toFixed(1)}% vs ${b.target}`).toBeLessThanOrEqual(b.hi);
    }
  });
});
