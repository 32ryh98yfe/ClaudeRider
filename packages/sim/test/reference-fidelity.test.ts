// End-to-end acceptance against held-out source observations, with an independent
// wide flat fixture and independent error calculation. No generated browser asset,
// fitted per-clip override, source time warp, or seeded inventory is required.
import { describe, expect, it } from 'vitest';
import { REFERENCE_CLIPS, type ReferenceClip } from '@cr/content/reference-driving.ts';
import { Boost, KMH_PER_MPS } from '@cr/sim';
import { ReferenceReplay, initializeReferenceWorld } from '../../../apps/client/src/dev/reference/replay.ts';
import { flatPlane } from './fixtures/kits.ts';
import { makeRig } from './rig.ts';
import { speedOf } from './util.ts';

const launchClips = REFERENCE_CLIPS.filter((clip) => clip.quantitativeEligible);
const heldOut = launchClips.filter((clip) => clip.split === 'validation');

function replay(clip: ReferenceClip) {
  const rig = makeRig(flatPlane().track, { countdownTicks: 0, seed: 4242 });
  initializeReferenceWorld(rig.w, clip);
  const input = new ReferenceReplay(clip);
  const k = rig.w.karts[0]!;
  const speed = [speedOf(k) * KMH_PER_MPS];
  for (let tick = 0; tick < input.durationTicks; tick++) {
    rig.tick((_world, frames) => { input.frameAt(tick, frames[0]!); });
    speed.push(speedOf(k) * KMH_PER_MPS);
  }
  return { rig, k, speed };
}

describe('reference fidelity: fixed held-out raw input replays (doc 17)', () => {
  it('keeps both independently selected launch validations in the quantitative gate', () => {
    expect(heldOut.map((clip) => clip.id)).toEqual(['intermediate-launch', 'beginner-launch']);
    for (const clip of launchClips) {
      expect(clip.initialSpeedKmh).toBe(0);
      expect(clip.initialBoosters).toBe(0);
      expect(clip.initialBoostTicks).toBe(0);
      expect(clip.keys[0]!.keys).toContain('up');
    }
  });

  it.each(heldOut)('$id: nonzero HUD-speed mean absolute relative error is at most 5%', (clip) => {
    const run = replay(clip);
    const observations = clip.observations.filter((observation) => observation.confidence === 'high' && observation.speedKmh > 0);
    expect(observations.length).toBeGreaterThanOrEqual(30);
    // This is ordinary nonzero MARE. The calibration tool's 20 km/h denominator
    // floor near rest must not make the public 5% held-out gate easier to satisfy.
    const error = observations.reduce((sum, observation) =>
      sum + Math.abs(run.speed[observation.frame * 2]! - observation.speedKmh) / observation.speedKmh, 0) / observations.length;
    expect(error, `${clip.id}: ${(100 * error).toFixed(3)}%`).toBeLessThanOrEqual(0.05);
    const displayedError = observations.reduce((sum, observation) =>
      sum + Math.abs(Math.round(run.speed[observation.frame * 2]!) - observation.speedKmh) / observation.speedKmh, 0) / observations.length;
    expect(displayedError, 'the real HUD rounds to integer km/h').toBeLessThanOrEqual(0.05);
    expect(run.k.stats.respawns).toBe(0);
    expect(run.k.stats.wallHits).toBe(0);
  });

  it.each(launchClips)('$id: the first normal booster is earned before the recorded Ctrl input consumes it', (clip) => {
    const { rig, k } = replay(clip);
    const award = rig.events.find((event) => event.t === 'gaugeFull');
    const use = rig.events.find((event) => event.t === 'boostStart' && event.kind === Boost.NORMAL);
    expect(award).toBeDefined();
    expect(use).toBeDefined();
    expect(award!.tick).toBeLessThan(use!.tick);
    expect(k.stats.boostsUsed).toBe(1);
    // Held-out HUD events independently constrain charging and boost timing.
    // The calibration clip has an explicitly documented variable overlay delay.
    if (clip.split === 'validation') {
      for (const [kind, actual] of [['gauge-full-visible', award!], ['booster-consumed-visible', use!]] as const) {
        const observation = clip.events.find((event) => event.kind === kind)!;
        expect(observation).toBeDefined();
        const toleranceTicks = Math.max(6, observation.uncertaintyFrames * 2);
        expect(Math.abs(actual.tick - observation.frame * 2), `${clip.id} ${kind}`).toBeLessThanOrEqual(toleranceTicks);
      }
    }
  });

  it('the higher start-boost target does not raise an overlapping normal booster cap', () => {
    const source = launchClips[0]!;
    const clip: ReferenceClip = {
      ...source, sourceEndFrame: source.sourceStartFrame + 90,
      initialStartTicks: 90, initialBoostTicks: 180,
      keys: [{ frame: 0, keys: ['up'] }],
    };
    const run = replay(clip);
    expect(Math.max(...run.speed)).toBeLessThanOrEqual(272.5);
    expect(run.speed[170]).toBeGreaterThan(271);
  });
});
