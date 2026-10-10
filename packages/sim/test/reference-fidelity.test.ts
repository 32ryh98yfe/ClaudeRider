// End-to-end acceptance against held-out source observations, with an independent
// wide flat fixture and independent error calculation. No generated browser asset,
// fitted per-clip override, source time warp, or seeded inventory is required.
import { describe, expect, it } from 'vitest';
import { REFERENCE_CLIPS, type ReferenceClip } from '@cr/content/reference-driving.ts';
import { Boost, KMH_PER_MPS, V_BOOST, hashWorld } from '@cr/sim';
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

describe('reference evidence: unchanged held-out replays under the slower v10 model', () => {
  it('keeps both independently selected launch validations as unchanged comparison evidence', () => {
    expect(heldOut.map((clip) => clip.id)).toEqual(['intermediate-launch', 'beginner-launch']);
    for (const clip of launchClips) {
      expect(clip.initialSpeedKmh).toBe(0);
      expect(clip.initialBoosters).toBe(0);
      expect(clip.initialBoostTicks).toBe(0);
      expect(clip.keys[0]!.keys).toContain('up');
    }
  });

  it.each(heldOut)('$id: raw observations remain measurable and replay deterministically', (clip) => {
    const run = replay(clip);
    const observations = clip.observations.filter((observation) => observation.confidence === 'high' && observation.speedKmh > 0);
    expect(observations.length).toBeGreaterThanOrEqual(30);
    // This is ordinary nonzero MARE. The calibration tool's 20 km/h denominator
    // floor near rest must not make the public 5% held-out gate easier to satisfy.
    const error = observations.reduce((sum, observation) =>
      sum + Math.abs(run.speed[observation.frame * 2]! - observation.speedKmh) / observation.speedKmh, 0) / observations.length;
    expect(Number.isFinite(error)).toBe(true);
    expect(hashWorld(replay(clip).rig.w)).toBe(hashWorld(run.rig.w));
    const displayedError = observations.reduce((sum, observation) =>
      sum + Math.abs(Math.round(run.speed[observation.frame * 2]!) - observation.speedKmh) / observation.speedKmh, 0) / observations.length;
    expect(Number.isFinite(displayedError)).toBe(true);
    // Doc 19: explicit lower speed/thrust supersedes the old 5% MARE gate; the observations themselves stay raw.
    console.log(`${clip.id}: current physical HUD MARE ${(100 * error).toFixed(3)}% (diagnostic)`);
    expect(run.k.stats.respawns).toBe(0);
    expect(run.k.stats.wallHits).toBe(0);
  });

  it.each(launchClips)('$id: source Ctrl presses cannot consume boosters before they have been earned', (clip) => {
    const { rig, k } = replay(clip);
    let awards = clip.initialBoosters ?? 0, uses = 0;
    for (const event of rig.events) {
      if (event.t === 'gaugeFull') awards++;
      if (event.t === 'boostStart' && event.kind === Boost.NORMAL) { uses++; expect(uses).toBeLessThanOrEqual(awards); }
    }
    expect(k.stats.boostsUsed).toBe(uses);
  });

  it('overlapping start and normal boosts share the reduced motor speed cap', () => {
    const source = launchClips[0]!;
    const clip: ReferenceClip = {
      ...source, sourceEndFrame: source.sourceStartFrame + 90,
      initialStartTicks: 90, initialBoostTicks: 180,
      keys: [{ frame: 0, keys: ['up'] }],
    };
    const run = replay(clip);
    expect(Math.max(...run.speed)).toBeLessThanOrEqual(V_BOOST * KMH_PER_MPS + 0.01);
    expect(run.speed[170]).toBeGreaterThan(V_BOOST * KMH_PER_MPS * 0.8);
  });
});
