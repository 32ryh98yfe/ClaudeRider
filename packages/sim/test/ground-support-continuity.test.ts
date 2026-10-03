import { describe, expect, it } from 'vitest';
import { paramsFor } from '@cr/sim';
import { halfStep, type MotionState } from '../src/kart/motion.ts';
import { bakedTrack, getContent } from './rig.ts';
import { place, racingRig } from './util.ts';

// Pumpkin's tilted-host/branch junction: measured at the first half-step that used to lose support.
// These are body coordinates AFTER displacement; rewind half a tick so the real movement query reaches them.
const contact = [172.66177139643187, 2.0739497431176033, -97.18813331091734] as const;
const velocity = [8.572723821826198, -0.5889214508876264, -14.900216060079924] as const;
const previousUp = [-0.03903217870255822, 0.9973194683343257, -0.06188995966285228] as const;
const track = bakedTrack('lantern_hollow/pumpkin_lane');
const hit = () => ({ t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, surf: 0, tri: 0, flags: 0 });

function crossing(grounded: 0 | 1, invertUp = false) {
  const rig = racingRig(track), kart = place(rig, 0, { path: 1, s: 16.7 });
  const b = kart.body, sign = invertUp ? -1 : 1;
  b.px = contact[0] - velocity[0] / 120; b.py = contact[1] - velocity[1] / 120; b.pz = contact[2] - velocity[2] / 120;
  [b.vx, b.vy, b.vz] = velocity;
  b.nx = previousUp[0] * sign; b.ny = previousUp[1] * sign; b.nz = previousUp[2] * sign;
  b.grounded = grounded; b.airTicks = grounded ? 0 : 1; b.coyote = grounded ? 7 : 0;
  Object.assign(rig.ctx.scratch.grav, { x: 0, y: -28, z: 0, scale: 1 });
  const ms: MotionState = { impactThisTick: false, contactThisTick: false, tx: 0, ty: 0, tz: 0 };
  halfStep(rig.w, kart, paramsFor(getContent().karts.byCode[kart.spec]!), rig.ctx, ms);
  return kart;
}

describe('ground support across a change of road normal', () => {
  it('keeps existing contact when the previous-normal ray misses a deck supported along gravity', () => {
    const primary = hit(), gravity = hit();
    expect(track.groundRay(contact[0] + previousUp[0], contact[1] + previousUp[1], contact[2] + previousUp[2], -previousUp[0], -previousUp[1], -previousUp[2], 2, primary)).toBe(false);
    expect(track.groundRay(contact[0], contact[1] + 1, contact[2], 0, -1, 0, 2, gravity)).toBe(true);
    expect(gravity.t).toBeGreaterThan(0);
    expect(gravity.t).toBeLessThan(1);
    const kart = crossing(1);
    expect(kart.body.grounded).toBe(1);
    expect(kart.body.py).toBeCloseTo(gravity.y, 6);
    expect(kart.body.coyote).toBe(7);
  });

  it('does not pull an airborne kart up through the same deck from underneath', () => {
    const kart = crossing(0);
    expect(kart.body.grounded).toBe(0);
    expect(kart.body.py).toBeLessThan(contact[1] + 0.05);
    expect(kart.body.airTicks).toBe(1);
  });

  it('does not reacquire world-gravity ground for an opposing previous up direction', () => {
    const kart = crossing(1, true);
    expect(kart.body.grounded).toBe(0);
    expect(kart.body.py).toBeLessThan(contact[1] + 0.05);
  });
});
