// Behavioral acceptance for docs/design/16-reference-driving.md. These checks use observed world state and
// event timing rather than duplicating the recovery equation. Doc 17 permits
// new corner input plans while preserving clean completion and terrain invariants.
import { describe, expect, it } from 'vitest';
import { Boost, Held, cloneWorld, copyWorld, hashWorld, type KartState } from '@cr/sim';
import type { SurfaceId } from '@cr/content';
import { strip } from './fixtures/kits.ts';
import { place, racingRig, speedOf, steerLeft } from './util.ts';

function setup(dir: 1 | -1 = 1, surface: SurfaceId = 'asphalt', boosted = false) {
  const rig = racingRig(strip(surface).track);
  const k = place(rig, 0, { s: 300, speed: 34 });
  // A settled 30° drift with zero residual yaw isolates the driver's recovery from the entry impulse.
  k.body.vx = 34 * Math.cos(Math.PI / 6); k.body.vz = dir * 34 * Math.sin(Math.PI / 6);
  k.drive.drift = 1; k.drive.driftDir = dir; k.drive.driftTicks = 30;
  k.drive.driftPeak = 0.5; k.drive.fatigueTicks = 30; k.drive.prevThrottle = 1;
  k.drive.prevHeld = Held.DRIFT;
  if (boosted) { k.drive.boostTicks = 300; k.drive.boostKind = Boost.NORMAL; }
  const advance = (steer = -dir, held = false) => {
    const before = rig.events.length;
    rig.tick((_w, inputs) => {
      const input = inputs[0]!;
      input.steer = steerLeft(steer); input.held = held ? Held.DRIFT : 0;
      input.throttle = 0; input.brake = 0;
    });
    return rig.events.slice(before);
  };
  return { rig, k, advance };
}

function slip(k: KartState): number {
  const b = k.body;
  const forward = b.vx * b.fx + b.vz * b.fz;
  const lateral = b.vx * b.fz - b.vz * b.fx;
  return Math.abs(Math.atan2(lateral, forward));
}

describe('physics: reference-video transient controls (doc 16)', () => {
  it.each([1, -1] as const)('direction %s: counter-steer recovers over multiple ticks without adding energy, then exits once', (dir) => {
    const r = setup(dir);
    let previous = speedOf(r.k), oldSlip = slip(r.k), exitAt = -1;
    for (let t = 0; t < 15; t++) {
      const events = r.advance();
      const speed = speedOf(r.k), currentSlip = slip(r.k);
      expect(speed).toBeLessThanOrEqual(previous + 0.001); // rounding allowance; throttle is released
      if (r.k.drive.drift) expect(currentSlip).toBeLessThan(oldSlip);
      if (t === 1) {
        expect(r.k.drive.counterTicks).toBe(2);
        expect(r.k.drive.drift).toBe(1);
        expect(currentSlip).toBeGreaterThan(0.1);
        expect(events.some((e) => e.t === 'cut')).toBe(false);
      }
      if (events.some((e) => e.t === 'cut')) {
        exitAt = t;
        expect(currentSlip).toBeLessThan(0.001);
        expect(r.k.body.yawRate).toBe(0);
        expect(r.k.drive.drift).toBe(0);
        expect(r.k.drive.instWindow).toBeGreaterThan(0);
      }
      previous = speed; oldSlip = currentSlip;
    }
    expect(exitAt).toBeGreaterThan(1);
    expect(exitAt).toBeLessThan(10);
    expect(r.rig.events.filter((e) => e.t === 'cut')).toHaveLength(1);
    expect(r.rig.events.filter((e) => e.t === 'driftEnd')).toHaveLength(1);
  });

  it('recovery respects low grip and stops when full counter-steer is released', () => {
    const asphalt = setup(), ice = setup(1, 'ice');
    for (let t = 0; t < 2; t++) { asphalt.advance(); ice.advance(); }
    expect(slip(ice.k)).toBeGreaterThan(slip(asphalt.k));
    const continued = setup(), interrupted = setup();
    for (let t = 0; t < 2; t++) { continued.advance(); interrupted.advance(); }
    continued.advance(); interrupted.advance(0);
    expect(interrupted.k.drive.counterTicks).toBe(0);
    expect(interrupted.k.drive.drift).toBe(1);
    expect(slip(interrupted.k)).toBeGreaterThan(slip(continued.k));
    expect(interrupted.rig.events.some((e) => e.t === 'cut')).toBe(false);
  });

  it('boosted counter-steer with Shift held remains reverse gauge rather than cut recovery', () => {
    const held = setup(1, 'asphalt', true), released = setup(1, 'asphalt', true);
    for (let t = 0; t < 3; t++) { held.advance(-1, true); released.advance(-1, false); }
    expect(held.k.drive.counterTicks).toBe(3);
    expect(held.k.drive.drift).toBe(1);
    expect(held.rig.events.some((e) => e.t === 'cut')).toBe(false);
    expect(slip(held.k)).toBeGreaterThan(slip(released.k));
    expect(held.k.drive.gauge).toBeGreaterThan(0);
  });

  it('restoring a world during recovery reproduces every subsequent world hash', () => {
    const r = setup();
    r.advance(); r.advance();
    const checkpoint = cloneWorld(r.rig.w), expected: number[] = [];
    for (let t = 0; t < 12; t++) { r.advance(); expected.push(hashWorld(r.rig.w)); }
    copyWorld(r.rig.w, checkpoint);
    for (let t = 0; t < 12; t++) { r.advance(); expect(hashWorld(r.rig.w)).toBe(expected[t]); }
  });

  it('Shift mashing cannot add drift kicks more frequently than once per nine ticks', () => {
    const r = setup();
    r.k.drive.prevHeld = 0;
    const fatigue = r.k.drive.fatigueTicks, duration = r.k.drive.driftTicks;
    for (let t = 0; t < 60; t++) {
      r.advance(0.8, t % 2 === 0);
      if (t === 0) {
        expect(r.k.drive.fatigueTicks).toBe(fatigue + 1);
        expect(r.k.drive.driftTicks).toBe(duration + 1);
      }
    }
    const kicks = r.rig.events.filter((e) => e.t === 'doubleDrift');
    expect(kicks.length).toBeGreaterThan(3);
    for (let i = 1; i < kicks.length; i++) expect(kicks[i]!.tick - kicks[i - 1]!.tick).toBeGreaterThanOrEqual(9);
  });

  it('the next intentional drift press is accepted on the ninth tick after the previous kick', () => {
    const r = setup();
    r.k.drive.prevHeld = 0;
    for (let t = 0; t <= 9; t++) r.advance(0.8, t === 0 || t === 2 || t === 9);
    const kicks = r.rig.events.filter((e) => e.t === 'doubleDrift');
    expect(kicks).toHaveLength(2);
    expect(kicks[1]!.tick - kicks[0]!.tick).toBe(9);
  });

  it('a drift press during wall stun cannot add a fresh yaw kick', () => {
    const r = setup();
    r.k.drive.prevHeld = 0; r.k.drive.stunTicks = 4;
    r.advance(0.8, true);
    expect(r.rig.events.some((e) => e.t === 'doubleDrift')).toBe(false);
    r.advance(0.8, false); r.advance(0.8, false);
    r.advance(0.8, true);
    expect(r.rig.events.filter((e) => e.t === 'doubleDrift')).toHaveLength(1);
  });
});
