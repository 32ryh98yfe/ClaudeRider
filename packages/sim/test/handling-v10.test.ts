import { describe, expect, it } from 'vitest';
import { Boost, Edge, Held, appendDriftRequest, cloneWorld, hashWorld, paramsFor, type InputFrame } from '@cr/sim';
import { InputActionFilter, type DriveActions } from '../../../apps/client/src/input/actionFilter.ts';
import schedules from '../../../docs/research/handling-keyboard-scenarios.json';
import { SelfPredictor } from '../src/ai/predict.ts';
import { clearDriftTech } from '../src/kart/tech.ts';
import { cornerKit, corridor, flatPlane } from './fixtures/kits.ts';
import { getContent } from './rig.ts';
import { place, racingRig, speedOf, steerLeft } from './util.ts';

const P = paramsFor(getContent().karts.get('pebble'));
const flat = () => { const r = racingRig(flatPlane().track); const k = place(r, 0, { s: 300, speed: P.vGrip }); return { r, k }; };
function control(f: InputFrame, steer: number, shift: boolean, press = false): void {
  f.steer = steerLeft(steer); f.steerIntent = Math.sign(-steer); f.throttle = 15; f.brake = 0;
  f.held = shift ? Held.DRIFT : 0; f.edges = press ? Edge.DRIFT : 0;
  f.driftRequests = press ? appendDriftRequest(0, -steer) : 0;
}

describe('v10 continuous handling acceptance', () => {
  it('reduces real normal/boost speeds and acceleration by 15%, preserving kart roles', () => {
    expect(P.vGrip).toBeCloseTo(34 * 0.85, 8); expect(P.vBoost).toBeCloseTo(45.11 * 0.85 ** 2, 8);
    expect(P.a0).toBeCloseTo(18 * 0.85, 8); expect(P.aStartMax).toBe(20);
    const { r, k } = flat();
    r.run(300, (_w, f) => control(f[0]!, 0, false)); expect(speedOf(k)).toBeCloseTo(P.vGrip, 2);
    k.drive.boostTicks = 600; k.drive.boostKind = Boost.NORMAL;
    r.run(300, (_w, f) => control(f[0]!, 0, false)); expect(speedOf(k)).toBeCloseTo(P.vBoost, 2);
  });

  it('entry and three rapid presses only alter curvature targets, with bounded yaw acceleration', () => {
    const { r, k } = flat(); let prevYaw = 0, prevHeading = 0;
    for (let t = 0; t < 90; t++) {
      const press = t === 0 || t === 12 || t === 24;
      r.tick((_w, f) => control(f[0]!, 1, t !== 11 && t !== 23, press));
      const h = Math.atan2(-k.body.fz, k.body.fx);
      let dh = h - prevHeading; if (dh < -Math.PI) dh += 2 * Math.PI;
      expect(Math.abs(k.body.yawRate - prevYaw)).toBeLessThanOrEqual(P.yawAccel / 60 + 2 / 4096);
      expect(Math.abs(dh - k.body.yawRate / 60)).toBeLessThan(0.0001);
      if (t === 0) expect(Math.abs(dh)).toBeLessThan(0.5 * Math.PI / 180);
      prevYaw = k.body.yawRate; prevHeading = h;
    }
    expect(k.drive.driftTarget).toBe(0.5); expect(k.stats.drifts).toBe(1);
  });

  it('one/two/three presses progressively tighten the actual velocity curve', () => {
    const radii: number[] = [];
    for (const presses of [1, 2, 3]) {
      const { r, k } = flat(); let distance = 0, turn = 0, heading = 0;
      for (let t = 0; t < 120; t++) {
        const press = t === 0 || (presses >= 2 && t === 12) || (presses === 3 && t === 24);
        const shift = !((presses >= 2 && t === 11) || (presses === 3 && t === 23));
        r.tick((_w, f) => control(f[0]!, 1, shift, press));
        const h = Math.atan2(-k.body.vz, k.body.vx);
        let dh = h - heading; if (dh < -Math.PI) dh += 2 * Math.PI;
        if (t >= 60) { distance += speedOf(k) / 60; turn += dh; }
        heading = h;
      }
      radii.push(distance / turn);
    }
    expect(radii[1]).toBeLessThan(radii[0]! * 0.97); expect(radii[2]).toBeLessThan(radii[1]! * 0.97);
  });

  for (const side of [-1, 1]) for (const boost of [false, true]) for (const held of [false, true]) {
    it(`counter-steer restores control without automatic re-entry: side=${side}, boost=${boost}, Shift=${held}`, () => {
      const { r, k } = flat();
      if (boost) { k.drive.boostTicks = 600; k.drive.boostKind = Boost.NORMAL; }
      r.run(45, (_w, f) => control(f[0]!, side, true));
      let reverse = -1, restored = -1;
      for (let t = 0; t < 60; t++) {
        r.tick((_w, f) => control(f[0]!, -side, held));
        if (reverse < 0 && k.body.yawRate * side < 0) reverse = t + 1;
        if (restored < 0 && k.drive.drift === 0) restored = t + 1;
      }
      expect(reverse).toBeGreaterThan(0); expect(reverse).toBeLessThanOrEqual(9);
      expect(restored).toBeGreaterThan(0); expect(restored).toBeLessThanOrEqual(30);
      expect(k.stats.drifts).toBe(1); expect(k.drive.drift).toBe(0);
    });
  }

  it('Shift release blends back to grip instead of deleting lateral velocity', () => {
    const { r, k } = flat(); r.run(45, (_w, f) => control(f[0]!, 1, true));
    const before = k.drive.driftEngagement;
    r.tick((_w, f) => control(f[0]!, 1, false));
    expect(k.drive.driftEngagement).toBeGreaterThan(0.8 * before); expect(k.drive.drift).toBe(1);
    r.run(60, (_w, f) => control(f[0]!, 0, false)); expect(k.drive.drift).toBe(0);
  });

  for (const pressMs of [20, 50, 100]) it(`a ${pressMs}ms Shift tap leaves a measurable physical skid after release`, () => {
    const { r, k } = flat(), filter = new InputActionFilter();
    const actions: DriveActions = { up: true, down: false, left: true, right: false, drift: true, boost: false };
    let released = false, end = 0, slideTicks = 0, slideDistance = 0;
    for (let t = 0; t < 120; t++) {
      const now = (t + 1) * 1000 / 60;
      if (!released && now >= pressMs) { filter.advance(actions, pressMs); actions.drift = false; released = true; }
      r.tick((_w, f) => filter.sample(actions, now, t === 0 ? Edge.DRIFT : 0, f[0]!));
      const b = k.body;
      const slip = Math.abs(Math.atan2(b.vx * b.fz - b.vz * b.fx, b.vx * b.fx + b.vz * b.fz)) * 180 / Math.PI;
      if (slip > 3) { slideTicks++; slideDistance += speedOf(k) / 60; }
      if (end === 0 && k.stats.drifts > 0 && k.drive.drift === 0) end = t + 1;
    }
    expect(end / 60).toBeGreaterThanOrEqual(0.8); expect(end / 60).toBeLessThanOrEqual(0.95);
    expect(slideTicks / 60).toBeGreaterThanOrEqual(0.5); expect(slideDistance).toBeGreaterThan(12);
  });

  for (const boost of [false, true]) for (const held of [false, true]) it(`counter-steer interrupts the minimum skid intent immediately, boost=${boost}, held=${held}`, () => {
    const { r, k } = flat();
    if (boost) { k.drive.boostTicks = 300; k.drive.boostKind = Boost.NORMAL; }
    for (let t = 0; t < 12; t++) r.tick((_w, f) => control(f[0]!, 1, held || t < 2, t === 0));
    expect(k.drive.driftIntentTicks).toBeGreaterThan(0);
    r.tick((_w, f) => control(f[0]!, -1, held));
    expect(k.drive.driftIntentTicks).toBe(0); expect(k.drive.driftRecovering).toBe(2);
    r.run(20, (_w, f) => control(f[0]!, -1, held)); expect(k.drive.drift).toBe(0);
    expect(k.stats.drifts).toBe(1);
  });

  it('a fresh repeat extends the skid intent smoothly, while braking cancels that intent', () => {
    const { r, k } = flat();
    for (let t = 0; t < 24; t++) r.tick((_w, f) => control(f[0]!, 1, t < 2, t === 0));
    expect(k.drive.driftIntentTicks).toBeLessThan(15);
    const yaw = k.body.yawRate;
    r.tick((_w, f) => control(f[0]!, 1, true, true));
    expect(k.drive.driftIntentTicks).toBe(36); expect(k.drive.driftTarget).toBe(0.25);
    expect(Math.abs(k.body.yawRate - yaw)).toBeLessThanOrEqual(P.yawAccel / 60 + 1 / 4096);
    r.tick((_w, f) => { control(f[0]!, 1, false); f[0]!.brake = 15; });
    expect(k.drive.driftIntentTicks).toBe(0); expect(k.drive.driftRecovering).toBe(1);
  });

  it('a Shift pressed before direction arms once, and stale filtered steering cannot cancel the fresh direction', () => {
    const { r, k } = flat();
    r.tick((_w, f) => control(f[0]!, 0, true, true));
    expect(k.drive.drift).toBe(0); expect(k.drive.driftArmed).toBe(1);
    r.tick((_w, f) => { control(f[0]!, -1, true); f[0]!.steer = -80; });
    expect(k.drive.drift).toBe(1); expect(k.drive.driftDir).toBe(-1);
    expect(k.drive.driftRecovering).toBe(0); expect(k.stats.drifts).toBe(1);
  });

  it('three presses in one tick survive as one entry plus two smooth tighten requests', () => {
    const { r, k } = flat();
    r.tick((_w, f) => {
      control(f[0]!, 1, true);
      f[0]!.driftRequests = appendDriftRequest(appendDriftRequest(appendDriftRequest(0, -1), -1), -1);
    });
    expect(k.stats.drifts).toBe(1); expect(k.drive.driftTarget).toBe(0.5);
    expect(k.body.yawRate).toBeLessThanOrEqual(P.yawAccel / 60 + 1 / 4096);
  });

  it('a fresh opposite press during recovery executes once after alignment', () => {
    const { r, k } = flat(); r.run(40, (_w, f) => control(f[0]!, 1, true));
    r.tick((_w, f) => control(f[0]!, -1, true, true));
    expect(k.drive.pendingDriftDir).toBe(-1);
    r.run(30, (_w, f) => control(f[0]!, -1, true));
    expect(k.stats.drifts).toBe(2); expect(k.drive.driftDir).toBe(-1); expect(k.drive.pendingDriftDir).toBe(0);
  });

  it('boosted and tightened slides never add motor speed beyond the actual planar boost cap', () => {
    const { r, k } = flat(); k.drive.boostTicks = 600; k.drive.boostKind = Boost.NORMAL;
    for (let t = 0; t < 180; t++) {
      r.tick((_w, f) => control(f[0]!, 1, t !== 23 && t !== 47, t === 0 || t === 24 || t === 48));
      expect(speedOf(k)).toBeLessThanOrEqual(P.vBoost + 2 / 4096);
    }
  });

  it('stronger traction keeps a held drift controlled instead of preserving sideways glide', () => {
    const { r, k } = flat(); let peakSlip = 0, lateralDistance = 0;
    for (let t = 0; t < 117; t++) {
      r.tick((_w, f) => control(f[0]!, 1, true, t === 0));
      const b = k.body, lateral = Math.abs(b.vx * b.fz - b.vz * b.fx);
      peakSlip = Math.max(peakSlip, Math.atan2(lateral, b.vx * b.fx + b.vz * b.fz) * 180 / Math.PI);
      lateralDistance += lateral / 60;
    }
    // Previous candidate: 17.891° and 12.004m. Both are actual velocity/heading measurements, not skid VFX.
    expect(peakSlip).toBeGreaterThan(6); expect(peakSlip).toBeLessThan(10);
    expect(lateralDistance).toBeLessThan(7);
  });

  for (const spec of getContent().karts.all) for (const boosting of [false, true]) {
    it(`retains drift gauge and instant reward after stronger grip: ${spec.id}, boost=${boosting}`, () => {
      const r = racingRig(flatPlane().track, { slots: [{ kartBodyId: spec.id }] });
      const k = place(r, 0, { s: 300, speed: spec.vGrip });
      k.drive.boosters = 1;
      if (boosting) { k.drive.boostTicks = 300; k.drive.boostKind = Boost.NORMAL; }
      r.run(60, (_w, f) => control(f[0]!, 1, true));
      const earned = k.drive.gauge + k.drive.boosters - 1;
      expect(earned).toBeGreaterThan(0.25);
      r.run(20, (_w, f) => control(f[0]!, -1, true));
      expect(k.drive.drift).toBe(0); expect(k.drive.instWindow).toBeGreaterThan(0);
      r.tick((_w, f) => { control(f[0]!, 0, false); f[0]!.throttle = 0; });
      r.tick((_w, f) => control(f[0]!, 0, false));
      expect(k.stats.instantBoosts).toBe(1); expect(k.drive.boosters).toBeGreaterThanOrEqual(1);
      if (boosting) { expect(k.drive.boostTicks).toBe(218); expect(k.drive.boostKind).toBe(Boost.NORMAL); }
    });
  }

  for (const side of [-1, 1]) for (const scenario of schedules.scenarios) {
    it(`fixed keyboard sequence negotiates ${side > 0 ? 'left' : 'right'} U-turn R${scenario.radiusM}, 12m wide, without any wall contact`, () => {
      const kit = cornerKit(scenario.radiusM, 180, schedules.widthM, side > 0 ? 'L' : 'R');
      const r = racingRig(kit.track), k = place(r, 0, { s: schedules.initialS, u: side * scenario.initialU, speed: schedules.initialSpeedMps });
      const filter = new InputActionFilter();
      let previous: DriveActions = { up: true, down: false, left: false, right: false, drift: false, boost: false };
      let contacts = 0, presses = 0;
      for (let t = 0; t < 520; t++) {
        const inside = t >= scenario.entryTick && t < scenario.entryTick + scenario.turnTicks;
        const counter = t >= scenario.entryTick + scenario.turnTicks && t < scenario.entryTick + scenario.turnTicks + scenario.counterTicks;
        const steer = inside ? side : counter ? -side : 0;
        const actions: DriveActions = { up: true, down: false, left: steer > 0, right: steer < 0, drift: inside || counter, boost: false };
        const press = t === scenario.entryTick; if (press) presses++;
        const now = t * 1000 / 60;
        filter.advance(previous, now); // physical key event time, before the held-state change
        r.tick((_w, f) => filter.sample(actions, now, press ? Edge.DRIFT : 0, f[0]!));
        previous = actions;
        if (k.body.wallContact) contacts++;
        if (k.race.loc.s >= kit.arcEnd + 60) break;
      }
      expect(presses).toBe(1); expect(k.stats.drifts).toBe(1); expect(contacts).toBe(0);
      expect(k.stats.wallHits).toBe(0); expect(k.stats.respawns).toBe(0);
      expect(k.race.loc.s).toBeGreaterThanOrEqual(kit.arcEnd + 60);
      const velocityHeading = Math.atan2(-k.body.vz, k.body.vx) * 180 / Math.PI;
      expect(Math.abs(Math.abs(velocityHeading) - 180)).toBeLessThan(2);
    });
  }

  it('wall impact preserves charge, booster stock and the already running boost', () => {
    const r = racingRig(corridor().track), k = place(r, 0, { s: 300, speed: 28, yawDeg: -60 });
    k.drive.gauge = 0.625; k.drive.boosters = 2; k.drive.boostTicks = 300; k.drive.boostKind = Boost.NORMAL;
    k.drive.drift = 1; k.drive.driftEngagement = 1; k.drive.driftDir = 1;
    let hit = false;
    for (let t = 0; t < 90; t++) {
      const before = k.drive.boostTicks;
      r.tick((_w, f) => control(f[0]!, 0, false));
      if (k.stats.wallHits) { expect(k.drive.boostTicks).toBe(before - 1); hit = true; break; }
    }
    expect(hit).toBe(true); expect(k.drive.gauge).toBeGreaterThanOrEqual(0.625); expect(k.drive.boosters).toBe(2);
  });

  for (const angle of [10, 15, 45, 90]) for (const kind of ['start', 'normal', 'team', 'instant'] as const) {
    it(`${kind} boost survives a ${angle} degree wall/grind contact with its normal countdown`, () => {
      const r = racingRig(corridor().track), k = place(r, 0, { s: 300, speed: P.vGrip, yawDeg: -angle });
      k.drive.prevThrottle = 1; k.drive.gauge = 0.625; k.drive.boosters = 2; k.drive.teamBoosters = 1;
      if (kind === 'start') k.drive.startTicks = 600;
      else if (kind === 'instant') k.drive.instTicks = 600;
      else { k.drive.boostTicks = 600; k.drive.boostKind = kind === 'team' ? Boost.TEAM : Boost.NORMAL; }
      let contacted = false;
      for (let t = 0; t < 180; t++) {
        const start = k.drive.startTicks, boost = k.drive.boostTicks, instant = k.drive.instTicks;
        const events = r.events.length;
        r.tick((_w, f) => control(f[0]!, 0, false));
        if (r.events.slice(events).some((e) => e.t === 'wall')) {
          expect(k.drive.startTicks).toBe(Math.max(0, start - 1));
          expect(k.drive.boostTicks).toBe(Math.max(0, boost - 1));
          expect(k.drive.instTicks).toBe(Math.max(0, instant - 1));
          expect(k.drive.gauge).toBe(0.625); expect(k.drive.boosters).toBe(2); expect(k.drive.teamBoosters).toBe(1);
          expect(r.events.slice(events).some((e) => e.t === 'boostEnd')).toBe(false);
          contacted = true; break;
        }
      }
      expect(contacted).toBe(true);
    });
  }

  it('handling states participate in hashes and clear on force-ended drift', () => {
    const { r, k } = flat(); r.run(20, (_w, f) => control(f[0]!, 1, true));
    for (const field of ['driftIntentTicks', 'driftArmed', 'driftEngagement', 'driftTightness', 'driftTarget', 'driftRecovering', 'pendingDriftDir'] as const) {
      const w = cloneWorld(r.w); (w.karts[0]!.drive[field] as number) += 1;
      expect(hashWorld(w)).not.toBe(hashWorld(r.w));
    }
    k.drive.pendingDriftDir = -1; clearDriftTech(r.w, k, r.ctx);
    expect(k.drive.driftEngagement).toBe(0); expect(k.drive.driftTarget).toBe(0); expect(k.drive.pendingDriftDir).toBe(0);
  });

  it('AI lookahead follows the shared continuous steering law', () => {
    const { r, k } = flat(); const pred = new SelfPredictor(6);
    for (let i = 0; i < 6; i++) pred.push(1, true, true, false, i === 0 ? Edge.DRIFT : 0);
    pred.run(k, P, 1);
    r.run(6, (_w, f) => control(f[0]!, 1, true));
    expect(Math.abs(pred.yaw - k.body.yawRate)).toBeLessThanOrEqual(6 / 4096);
    expect(pred.engagement).toBeCloseTo(k.drive.driftEngagement, 3);
    expect(pred.vx).toBeCloseTo(k.body.vx, 2); expect(pred.vy).toBeCloseTo(-k.body.vz, 2);
  });
});
