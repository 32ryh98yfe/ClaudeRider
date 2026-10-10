import { describe, expect, it } from 'vitest';
import { AI_TIERS, type BakedTrack, type HazardDefBaked, type HazardPose } from '@cr/sim';
import { planLane, type LaneQuery, type LaneResult } from '../src/ai/avoid.ts';
import { makeBlocks, scanHazards } from '../src/ai/hazards.ts';
import { planFor } from '../src/ai/plan.ts';
import { NEUTRAL_PERSONALITY, resolveProfile } from '../src/ai/profiles.ts';
import { corridor, flatPlane } from './fixtures/kits.ts';
import { racingRig } from './util.ts';

describe('AI respects persistent solid hazard bodies', () => {
  it('finds an outside lane around a central body wider than all five old lane candidates', () => {
    const track = corridor(14).track, r = racingRig(track), blocks = makeBlocks();
    blocks.n = 1; blocks.u0[0] = -3.5; blocks.u1[0] = 3.5; blocks.ds[0] = 30; blocks.clearTicks[0] = 300;
    const q: LaneQuery = { slot: 0, sMain: 200, path: 0, u: 0, vS: 20, vU: 0, tx: 1, tz: 0, rx: 0, rz: 1,
      hw: 7, lineAbs: 0, laneOff: 0, la: 8 / 60, straight: false, nextCornerDir: 1, nextCornerDist: 30,
      lineWeight: 1, draftActive: false, wish: 0, horizon: 3, blocks };
    const result: LaneResult = { laneOff: 0, ttc: 0, closing: 0, actualClosing: 0, drafting: false, overtaking: false, urgent: false };
    const profile = resolveProfile(AI_TIERS.pro, {}, NEUTRAL_PERSONALITY, null);
    planLane(r.w, track, q, profile, result);
    expect(Math.abs(result.laneOff)).toBeGreaterThan(3.5);
    expect(Math.abs(result.laneOff)).toBeLessThanOrEqual(7 - 1.3); expect(result.urgent).toBe(true);
    const before = result.laneOff;
    r.w.karts[0]!.status.immuneUntil = r.w.tick + 300;
    r.w.karts[0]!.status.cc = 4;
    planLane(r.w, track, q, profile, result);
    expect(result.laneOff).toBe(before); // damage immunity cannot make the mechanical body passable
  });

  it('includes a visible inactive solid but still ignores an inactive trigger volume', () => {
    const base = flatPlane().track, track = Object.create(base) as BakedTrack;
    const h: HazardDefBaked = { id: 99, kind: 'press', path: 0, s: 300, u: 0, shape: 'sphere', size: [1.75, 0, 0],
      periodTicks: 120, activeFrom: 60, activeTo: 90, telegraphTicks: 0, offsetTicks: 0, effect: 'squash', contact: 'solid' };
    Object.defineProperty(track, 'hazards', { value: [h] });
    Object.defineProperty(track, 'hazardPose', { value: (_id: number, _tick: number, p: HazardPose): void => {
      Object.assign(p, { x: 200, y: 1.5, z: 0, active: 0, telegraph: 0, fx: 1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0 });
    } });
    const blocks = makeBlocks(), plan = planFor(track).paths[0]!;
    scanHazards(track, plan, 250, 20, 0, blocks); expect(blocks.n).toBe(1);
    h.contact = 'trigger'; scanHazards(track, plan, 250, 20, 0, blocks); expect(blocks.n).toBe(0);
  });
});
