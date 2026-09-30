// Robustness (10-sim-spec §14.8): randomized drops never fall through the ground, and boosted karts never tunnel
// through walls. DROPS scales the drop count per track (default 10 000).
import { describe, expect, it } from 'vitest';
import type { BakedTrack } from '@cr/sim';
import { bakedTrack } from './rig.ts';
import { dropTest } from './drops.ts';
import { flatPlane, corridor, cornerKit, halfpipe, helixKit, jumpKit } from './fixtures/kits.ts';
import { racingRig, place } from './util.ts';

const DROPS = Number(process.env.DROPS ?? 10000);

describe('robustness: random drops (§14.8)', () => {
  const tracks: [string, () => BakedTrack][] = [
    ['flat plane', () => flatPlane().track],
    ['corridor 16 m', () => corridor(16).track],
    ['corner R12 90°', () => cornerKit(12, 90, 12).track],
    ['halfpipe 60°', () => halfpipe(60).track],
    ['stacked helix', () => helixKit(10, 2.5).track],
    ['jump', () => jumpKit(2, true).track],
    ['f1_branch (DSL)', () => bakedTrack('_test/f1_branch')],
    ['f2_jumps (DSL)', () => bakedTrack('_test/f2_jumps')],
    ['meadow_loop', () => bakedTrack('clayhill_village/meadow_loop')],
    ['proving_ring', () => bakedTrack('spark_circuit/proving_ring')],
  ];
  it.each(tracks)('%s: every drop lands on ground or triggers a kill respawn; no fall-through', (_name, mk) => {
    const s = dropTest(mk(), DROPS, 7);
    expect(s.fallThrough).toBe(0);
    expect(s.stuck).toBe(0);
    expect(s.landed + s.killed).toBe(s.drops);
    expect(s.landed).toBeGreaterThan(0);
  });
});

describe('robustness: boosted wall tunnelling (§10.4, R5)', () => {
  /** Drives at 45.3 m/s (team-boost speed) into a wall at `deg`; returns the worst penetration past the wall plane. */
  function ram(track: BakedTrack, s: number, u: number, deg: number, wallU: number, side: 1 | -1): number {
    const rig = racingRig(track);
    const k = place(rig, 0, { s, u, speed: 45.3, yawDeg: -side * deg });
    k.drive.boostTicks = 400; k.drive.boostKind = 2;
    let worst = -1e9;
    for (let t = 0; t < 90; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      worst = Math.max(worst, side * k.race.loc.u - wallU);
      if (k.race.respawnPhase !== 0) break;
    }
    return worst;
  }
  it.each([5, 10, 15, 20, 30, 45, 60, 75, 90])('corridor walls at %i° are never crossed', (deg) => {
    const t = corridor(16).track;
    expect(ram(t, 300, 0, deg, 8, 1)).toBeLessThan(0);
    expect(ram(t, 300, 0, deg, 8, -1)).toBeLessThan(0);
  });
  it.each([10, 45, 90])('corner inner/outer walls and halfpipe lips at %i° are never crossed', (deg) => {
    const c = cornerKit(12, 90, 12);
    expect(ram(c.track, c.arcStart + 5, 0, deg, 6, 1)).toBeLessThan(0);
    expect(ram(c.track, c.arcStart + 5, 0, deg, 6, -1)).toBeLessThan(0);
    const h = halfpipe(60);
    const top = h.floor + h.radius * Math.sin((60 * Math.PI) / 180);
    expect(ram(h.track, 300, 0, deg, top, 1)).toBeLessThan(0.05);
  });
});
