// Behavioral acceptance for docs/design/16-reference-driving.md. These checks use observed world state and
// event timing rather than duplicating the recovery equation. Doc 17 permits
// new corner input plans while preserving clean completion and terrain invariants.
import { describe, expect, it } from 'vitest';
import { Boost, Edge, Held, cloneWorld, copyWorld, hashWorld, V_REF, type KartState } from '@cr/sim';
import type { SurfaceId } from '@cr/content';
import { strip } from './fixtures/kits.ts';
import { place, racingRig, speedOf, steerLeft } from './util.ts';

function setup(dir: 1 | -1 = 1, surface: SurfaceId = 'asphalt', boosted = false) {
  const rig = racingRig(strip(surface).track);
  const k = place(rig, 0, { s: 300, speed: V_REF });
  // A settled 30° drift with zero residual yaw isolates the driver's recovery from the entry impulse.
  k.body.vx = V_REF * Math.cos(Math.PI / 6); k.body.vz = dir * V_REF * Math.sin(Math.PI / 6);
  k.drive.drift = 1; k.drive.driftDir = dir; k.drive.driftTicks = 30;
  k.drive.driftEngagement = 1; k.drive.driftIntentTicks = 36;
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
        expect(currentSlip).toBeLessThan(6 * Math.PI / 180); // retain residual velocity, never snap it to zero
        // Recovery aligns travel with the nose; it must not erase the driver's requested rotation.
        expect(r.k.body.yawRate * dir).toBeLessThan(-0.1);
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

  it('recovery respects low grip and finishes after the counter key returns to neutral', () => {
    const asphalt = setup(), ice = setup(1, 'ice');
    for (let t = 0; t < 2; t++) { asphalt.advance(); ice.advance(); }
    expect(slip(ice.k)).toBeGreaterThan(slip(asphalt.k));
    const neutral = setup(); neutral.advance(); neutral.advance();
    for (let t = 0; t < 20; t++) neutral.advance(0);
    expect(neutral.k.drive.drift).toBe(0); expect(slip(neutral.k)).toBeLessThan(6 * Math.PI / 180);
    expect(neutral.rig.events.filter((e) => e.t === 'driftEnd')).toHaveLength(1);
  });

  it('crossing the neutral steering boundary does not jump the drift response rate', () => {
    const neutral = setup(), counter = setup();
    neutral.k.body.yawRate = 1.5; counter.k.body.yawRate = 1.5;
    neutral.advance(0); counter.advance(-1 / 127);
    expect(Math.abs(counter.k.body.yawRate - neutral.k.body.yawRate)).toBeLessThan(0.005);
  });

  it('boost and held Shift cannot prevent counter-steer recovery', () => {
    const held = setup(1, 'asphalt', true), released = setup(1, 'asphalt', true);
    for (let t = 0; t < 15; t++) { held.advance(-1, true); released.advance(-1, false); }
    expect(held.k.drive.drift).toBe(0); expect(released.k.drive.drift).toBe(0);
    expect(held.rig.events.filter((e) => e.t === 'cut')).toHaveLength(1);
    expect(held.k.drive.boostTicks).toBe(285); expect(held.k.drive.gauge).toBeGreaterThan(0);
  });

  it('restoring a world during recovery reproduces every subsequent world hash', () => {
    const r = setup();
    r.advance(); r.advance();
    const checkpoint = cloneWorld(r.rig.w), expected: number[] = [];
    for (let t = 0; t < 12; t++) { r.advance(); expected.push(hashWorld(r.rig.w)); }
    copyWorld(r.rig.w, checkpoint);
    for (let t = 0; t < 12; t++) { r.advance(); expect(hashWorld(r.rig.w)).toBe(expected[t]); }
  });

  it('rapid Shift pulses remain responsive while bounded yaw prevents runaway rotation', () => {
    const r = setup();
    r.k.drive.prevHeld = 0;
    const fatigue = r.k.drive.fatigueTicks, duration = r.k.drive.driftTicks;
    for (let t = 0; t < 60; t++) {
      r.advance(0.8, t % 2 === 0);
      if (t === 0) {
        expect(r.k.drive.fatigueTicks).toBe(fatigue + 1);
        expect(r.k.drive.driftTicks).toBe(duration + 1);
      }
      expect(Math.abs(r.k.body.yawRate)).toBeLessThan(3.2);
    }
    const kicks = r.rig.events.filter((e) => e.t === 'doubleDrift');
    expect(kicks).toHaveLength(30);
    for (let i = 1; i < kicks.length; i++) expect(kicks[i]!.tick - kicks[i - 1]!.tick).toBe(2);
  });

  it('closely spaced and separated deliberate presses all adjust the target', () => {
    const r = setup();
    r.k.drive.prevHeld = 0;
    for (let t = 0; t <= 9; t++) r.advance(0.8, t === 0 || t === 2 || t === 9);
    const kicks = r.rig.events.filter((e) => e.t === 'doubleDrift');
    expect(kicks).toHaveLength(3);
    expect(kicks.map((e) => e.tick - kicks[0]!.tick)).toEqual([0, 2, 9]);
  });

  it.each([1, -1] as const)('direction %s: two and three Shift pulses progressively tighten the turn without a heading jump', (dir) => {
    const headings: number[] = [];
    for (let presses = 1; presses <= 3; presses++) {
      const rig = racingRig(strip('asphalt').track), k = place(rig, 0, { s: 300, speed: V_REF });
      let previousHeading = 0;
      for (let t = 0; t < 60; t++) {
        rig.tick((_w, inputs) => {
          inputs[0]!.steer = steerLeft(dir);
          inputs[0]!.held = t % 6 < 2 && t < presses * 6 ? Held.DRIFT : 0;
          inputs[0]!.throttle = 15;
        });
        const heading = Math.atan2(-k.body.fz, k.body.fx);
        // Every entry and repeat rotates only through the actual bounded yaw integration.
        if (t === 6 || t === 12) expect(Math.abs(heading - previousHeading - k.body.yawRate / 60)).toBeLessThan(0.0001);
        previousHeading = heading;
      }
      expect(rig.events.filter((e) => e.t === 'doubleDrift')).toHaveLength(presses - 1);
      headings.push(previousHeading * dir);
    }
    expect(headings[1]! - headings[0]!).toBeGreaterThan(0.03);
    expect(headings[2]! - headings[1]!).toBeGreaterThan(0.02);
  });

  it.each([1, -1] as const)('direction %s: a fresh opposite Shift queues one transition rather than injecting yaw', (dir) => {
    const r = setup(dir); r.k.body.yawRate = dir * 1.5; r.k.drive.prevHeld = 0;
    const before = r.k.body.yawRate; r.advance(-dir, true);
    expect(r.k.drive.pendingDriftDir).toBe(-dir);
    expect(Math.abs(r.k.body.yawRate - before)).toBeLessThanOrEqual(24 / 60 + 1 / 4096);
    for (let t = 0; t < 20; t++) r.advance(-dir, true);
    expect(r.k.drive.pendingDriftDir).toBe(0); expect(r.k.drive.driftDir).toBe(-dir);
    expect(r.rig.events.filter((e) => e.t === 'driftStart')).toHaveLength(1);
  });

  it('a deliberate Shift press immediately after recovery starts the next drift without an input blackout', () => {
    const r = setup();
    for (let t = 0; t < 15 && r.k.drive.drift; t++) r.advance();
    expect(r.k.drive.drift).toBe(0);
    expect(r.k.drive.reDriftLock).toBeGreaterThan(0);
    const events = r.advance(-1, true);
    expect(events.some((e) => e.t === 'driftStart')).toBe(true);
    expect(r.k.drive.drift).toBe(1); expect(r.k.drive.driftDir).toBe(-1);
    expect(r.k.body.yawRate).toBeLessThan(-0.1);
  });

  it('simultaneous direction/Shift uses the fresh key edge while filtered steering still has its old sign', () => {
    const rig = racingRig(strip('asphalt').track), k = place(rig, 0, { s: 300, speed: V_REF });
    rig.tick((_w, inputs) => {
      inputs[0]!.steer = steerLeft(0.9); // still fading from the previous left press
      inputs[0]!.held = Held.DRIFT; inputs[0]!.edges = Edge.TAP_R; inputs[0]!.steerIntent = 1;
      inputs[0]!.throttle = 15;
    });
    expect(k.drive.driftDir).toBe(-1);
    expect(k.drive.driftRecovering).toBe(0);
    expect(Math.abs(k.body.yawRate)).toBeLessThanOrEqual(5.5 / 60 + 1 / 4096);
  });

  it.each([0, Held.DRIFT])('a compressed Shift press with held=%s produces exactly one impulse and latches actual held state', (held) => {
    const r = setup();
    r.rig.tick((_w, inputs) => {
      inputs[0]!.steer = steerLeft(0.8); inputs[0]!.held = held;
      inputs[0]!.edges = Edge.DRIFT; inputs[0]!.throttle = 15;
    });
    expect(r.rig.events.filter((e) => e.t === 'doubleDrift')).toHaveLength(1);
    expect(r.k.drive.prevHeld).toBe(held);
    r.rig.tick((_w, inputs) => { inputs[0]!.edges = 0; });
    expect(r.rig.events.filter((e) => e.t === 'doubleDrift')).toHaveLength(1);
  });

  it('restoring during a pulse train reproduces every hash, including presses compressed between ticks', () => {
    const r = setup();
    const advance = (t: number) => r.rig.tick((_w, inputs) => {
      inputs[0]!.steer = steerLeft(t < 6 ? 0.8 : -1); inputs[0]!.held = t < 3 ? Held.DRIFT : 0;
      inputs[0]!.edges = t % 3 === 0 ? Edge.DRIFT : 0;
    });
    advance(0); advance(1);
    const checkpoint = cloneWorld(r.rig.w), expected: number[] = [];
    for (let t = 2; t < 15; t++) { advance(t); expected.push(hashWorld(r.rig.w)); }
    copyWorld(r.rig.w, checkpoint);
    for (let t = 2; t < 15; t++) { advance(t); expect(hashWorld(r.rig.w)).toBe(expected[t - 2]); }
  });

  it('a fresh press during wall stun is armed without a yaw kick, then enters once control is available', () => {
    const r = setup(); r.k.drive.drift = 0; r.k.drive.driftEngagement = 0; r.k.drive.driftIntentTicks = 0;
    r.k.drive.prevHeld = 0; r.k.drive.stunTicks = 4;
    const before = r.k.body.yawRate; r.advance(0.8, true);
    expect(r.k.drive.driftArmed).toBe(1); expect(r.k.drive.drift).toBe(0);
    expect(Math.abs(r.k.body.yawRate - before)).toBeLessThanOrEqual(5.5 / 60 + 1 / 4096);
    for (let t = 0; t < 6; t++) r.advance(0.8, true);
    expect(r.rig.events.filter((e) => e.t === 'driftStart')).toHaveLength(1);
  });
});
