import { describe, expect, it } from 'vitest';
import { paramsFor, type BakedTrack, type GroundHit } from '@cr/sim';
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

function crossing(grounded: 0 | 1, invertUp = false, drop = 0) {
  const rig = racingRig(track), kart = place(rig, 0, { path: 1, s: 16.7 });
  const b = kart.body, sign = invertUp ? -1 : 1;
  b.px = contact[0] - velocity[0] / 120; b.py = contact[1] - velocity[1] / 120 - drop; b.pz = contact[2] - velocity[2] / 120;
  [b.vx, b.vy, b.vz] = velocity;
  b.nx = previousUp[0] * sign; b.ny = previousUp[1] * sign; b.nz = previousUp[2] * sign;
  b.grounded = grounded; b.airTicks = grounded ? 0 : 1; b.coyote = grounded ? 7 : 0;
  Object.assign(rig.ctx.scratch.grav, { x: 0, y: -28, z: 0, scale: 1 });
  const ms: MotionState = { impactThisTick: false, contactThisTick: false, tx: 0, ty: 0, tz: 0 };
  halfStep(rig.w, kart, paramsFor(getContent().karts.byCode[kart.spec]!), rig.ctx, ms);
  return kart;
}

describe('ground support across a change of road normal', () => {
  it('preserves grounded forward travel while glancing the Orbital wall at a tiny downward seam', () => {
    const orbital = bakedTrack('orbital_nexus/orbital_express'), rig = racingRig(orbital), k = place(rig, 0, { path: 0, s: 402.844, u: -5.151, speed: 17 }), b = k.body;
    Object.assign(b, { px: 164.101, py: 0, pz: -240.98 });
    const startX = b.px, startZ = b.pz, fx = b.fx, fz = b.fz;
    halfStep(rig.w, k, paramsFor(getContent().karts.byCode[k.spec]!), rig.ctx, { impactThisTick: false, contactThisTick: false, tx: fx, ty: b.fy, tz: fz });
    expect((b.px - startX) * fx + (b.pz - startZ) * fz).toBeGreaterThan(0.12);
    expect(b.grounded).toBe(1); expect(Math.hypot(b.vx, b.vy, b.vz)).toBeGreaterThan(16);
  });

  it('a tilted falling body cannot be pushed through the road top by the outward underside', () => {
    const proving = bakedTrack('spark_circuit/proving_ring'), rig = racingRig(proving), k = rig.w.karts[0]!, b = k.body;
    Object.assign(b, { px: 252.918, py: -.231, pz: -55.894, vx: -12.8, vy: -30.97, vz: -1.87, nx: .71, ny: .45, nz: -Math.sqrt(1 - .71 ** 2 - .45 ** 2), grounded: 0, airTicks: 61, coyote: 0 });
    proving.locateGlobal(b.px, b.py, b.pz, k.race.loc);
    Object.assign(rig.ctx.scratch.grav, { x: 0, y: -28, z: 0, scale: 1 });
    const ms = { impactThisTick: false, contactThisTick: false, tx: 1, ty: 0, tz: 0 }, params = paramsFor(getContent().karts.byCode[k.spec]!);
    halfStep(rig.w, k, params, rig.ctx, ms); halfStep(rig.w, k, params, rig.ctx, ms);
    const support = hit(); expect(proving.groundRay(b.px, b.py + 1, b.pz, 0, -1, 0, 2, support)).toBe(true);
    expect(b.grounded).toBe(1); expect(b.py).toBeCloseTo(support.y, 5); expect(b.py).toBeGreaterThan(-1);
  });

  it('lands on a front-facing ground triangle crossed by the foot even when the endpoint ray misses it', () => {
    const patch = Object.create(track) as BakedTrack;
    patch.groundRay = (x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number, out: GroundHit): boolean => {
      if (dy >= 0) return false;
      const t = -y / dy, px = x + dx * t, pz = z + dz * t;
      if (t < 0 || t > max || Math.abs(px) > 0.05 || Math.abs(pz) > 1) return false;
      Object.assign(out, { t, x: px, y: 0, z: pz, nx: 0, ny: 1, nz: 0, surf: 1, tri: 0, flags: 0 }); return true;
    };
    patch.sphereWalls = () => 0;
    const rig = racingRig(patch), k = rig.w.karts[0]!, b = k.body;
    b.px = -1 / 30; b.py = 0.05; b.pz = 0; b.vx = 20; b.vy = -30; b.vz = 0;
    b.nx = 0.7; b.ny = 0.45; b.nz = Math.sqrt(1 - 0.7 * 0.7 - 0.45 * 0.45);
    b.grounded = 0; b.airTicks = 20; b.coyote = 0;
    Object.assign(rig.ctx.scratch.grav, { x: 0, y: -28, z: 0, scale: 1 });
    const endX = b.px + b.vx / 120, endY = b.py + b.vy / 120;
    expect(patch.groundRay(endX, endY + 1, 0, 0, -1, 0, 2, hit())).toBe(false);
    halfStep(rig.w, k, paramsFor(getContent().karts.byCode[k.spec]!), rig.ctx, { impactThisTick: false, contactThisTick: false, tx: 1, ty: 0, tz: 0 });
    expect(b.grounded).toBe(1); expect(b.py).toBeCloseTo(0, 8); expect(b.vy).toBeCloseTo(0, 8);
    expect(Math.abs(b.px)).toBeLessThanOrEqual(0.05);
  });

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

  it('an airborne kart may land on the lower crossed surface, but is not pulled onto the upper deck', () => {
    const lower = hit(), speed = Math.hypot(...velocity);
    expect(track.groundRay(contact[0] - velocity[0] / 120, contact[1] - velocity[1] / 120, contact[2] - velocity[2] / 120, velocity[0] / speed, velocity[1] / speed, velocity[2] / speed, speed / 120 + 1e-7, lower)).toBe(true);
    const kart = crossing(0);
    expect(kart.body.grounded).toBe(1);
    expect(kart.body.py).toBeCloseTo(lower.y, 6);
    expect(kart.body.py).toBeLessThan(contact[1] + 0.05);
  });

  it('does not reacquire either deck when the airborne foot starts underneath both surfaces', () => {
    const kart = crossing(0, false, 0.2);
    expect(kart.body.grounded).toBe(0);
    expect(kart.body.py).toBeLessThan(contact[1] - 0.15);
    expect(kart.body.airTicks).toBe(1);
  });

  it('does not reacquire world-gravity ground for an opposing previous up direction', () => {
    const kart = crossing(1, true);
    expect(kart.body.grounded).toBe(0);
    expect(kart.body.py).toBeLessThan(contact[1] + 0.05);
  });
});
