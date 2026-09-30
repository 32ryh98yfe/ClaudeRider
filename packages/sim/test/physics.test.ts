// physics: acceptance numbers from docs/design/01-decisions.md (ADR-004/005), measured on a flat 1 km straight.
import { describe, expect, it } from 'vitest';
import { Edge, V_REF, KMH_PER_MPS, type InputFrame } from '@cr/sim';
import { bakedTrack, makeRig, kmh } from './rig.ts';

const track = bakedTrack('_test/drag_oval');
const V_GRIP_DISPLAY = V_REF * KMH_PER_MPS;

/** Holds throttle from `pressAt` (absolute tick) on; returns the rig. */
function launch(pressAt: number, ticks: number, extra?: (t: number, inp: InputFrame) => void) {
  const rig = makeRig(track, { laps: 1 });
  rig.run(ticks, (w, inp) => { inp[0]!.throttle = w.tick >= pressAt ? 15 : 0; extra?.(w.tick, inp[0]!); });
  return rig;
}

describe('physics: acceleration', () => {
  it('0→100 km/h in 1.17 ± 0.05 s and 0→97% of top speed in 3.95 ± 0.10 s', () => {
    const rig = makeRig(track, { laps: 1 });
    const press = rig.w.goTick + 30; // after the start-boost window: plain standing start
    let t100 = -1, t97 = -1;
    while (rig.w.tick < press + 600) {
      rig.tick((w, inp) => { inp[0]!.throttle = w.tick >= press ? 15 : 0; });
      const v = kmh(rig.w), t = (rig.w.tick - press) / 60;
      if (t100 < 0 && v >= 100) t100 = t;
      if (t97 < 0 && v >= 0.97 * V_GRIP_DISPLAY) t97 = t;
    }
    expect(t100).toBeGreaterThan(1.12); expect(t100).toBeLessThan(1.22);
    expect(t97).toBeGreaterThan(3.85); expect(t97).toBeLessThan(4.05);
    expect(kmh(rig.w)).toBeGreaterThan(0.99 * V_GRIP_DISPLAY);
    expect(kmh(rig.w)).toBeLessThan(1.005 * V_GRIP_DISPLAY);
  });
});

describe('physics: booster', () => {
  it('reaches ≥ 237 km/h after 1.0 s and plateaus at 239–240.5 km/h', () => {
    const rig = makeRig(track, { laps: 1 });
    const press = rig.w.goTick + 30;
    rig.run(press + 480 - rig.w.tick, (w, inp) => { inp[0]!.throttle = w.tick >= press ? 15 : 0; });
    rig.w.karts[0]!.drive.boosters = 1;
    const use = rig.w.tick;
    const at: Record<number, number> = {};
    rig.run(160, (w, inp) => { inp[0]!.throttle = 15; if (w.tick === use) inp[0]!.edges |= Edge.USE_ITEM; at[w.tick - use] = kmh(w); });
    expect(rig.w.karts[0]!.stats.boostsUsed).toBe(1);
    expect(at[61]!).toBeGreaterThanOrEqual(237);
    expect(at[150]!).toBeGreaterThanOrEqual(239);
    expect(at[150]!).toBeLessThanOrEqual(240.5);
  });
});

describe('physics: start boost', () => {
  it('PERFECT start gains 35 ± 3 m at 5 s over a held-throttle (no-boost) start', () => {
    const base = makeRig(track, { laps: 1 });
    const go = base.w.goTick;
    base.run(go + 300 - base.w.tick, (_w, inp) => { inp[0]!.throttle = 15; });
    const perfect = launch(go + 2, go + 300);
    expect(perfect.w.karts[0]!.stats.startTier).toBe(5);
    expect(base.w.karts[0]!.stats.startTier).toBe(1);
    const gain = perfect.w.karts[0]!.race.raceDist - base.w.karts[0]!.race.raceDist;
    expect(gain).toBeGreaterThan(32);
    expect(gain).toBeLessThan(38);
  });

  it('a false start (pressed > 12 ticks early) costs wheelspin', () => {
    const go = makeRig(track).w.goTick;
    const early = launch(go - 30, go + 120);
    expect(early.w.karts[0]!.stats.startTier).toBe(2);
    const clean = launch(go + 30, go + 120 + 30);
    expect(early.w.karts[0]!.race.raceDist).toBeLessThan(clean.w.karts[0]!.race.raceDist + 20);
  });
});

describe('physics: walls', () => {
  /** Cruise at top speed on the straight, then yaw toward the right wall by `deg` and let go of the wheel. */
  function wallHit(deg: number) {
    const rig = makeRig(track, { laps: 1 });
    const press = rig.w.goTick + 30;
    rig.run(press + 420 - rig.w.tick, (w, inp) => { inp[0]!.throttle = w.tick >= press ? 15 : 0; });
    const k = rig.w.karts[0]!, b = k.body;
    const a = (deg * Math.PI) / 180;
    // straight runs along +x; right of travel is -z (track right = up × fwd = −z for fwd +x)
    const loc = k.race.loc;
    const toWall = 20 / 2 - loc.u - 0.9;
    const speed = Math.hypot(b.vx, b.vz);
    const fx = Math.cos(a), fz = -Math.sin(a);
    // back off so the kart travels ~6 m before contact
    const back = 6 - toWall / Math.max(1e-3, Math.sin(a));
    b.fx = fx; b.fz = fz; b.vx = fx * speed; b.vz = fz * speed; b.yawRate = 0;
    b.px += fx * back; b.pz += fz * back;
    const v0 = kmh(rig.w);
    let minV = v0, stun = 0;
    k.drive.boostTicks = 60; k.drive.boostKind = 1;
    rig.run(60, (w, inp) => { inp[0]!.throttle = 15; inp[0]!.steer = 0; });
    for (const e of rig.events) if (e.t === 'wall') { stun = Math.max(stun, e.severity); }
    const boostCancelled = k.drive.boostTicks === 0;
    minV = Math.min(minV, kmh(rig.w));
    return { v0, loss: v0 - minV, stun, boostCancelled, hits: k.stats.wallHits };
  }
  it.todo('10° graze ≈ −3 km/h, 30° ≈ −47 km/h, 60° stuns and cancels the booster (tuned in lane L1)');
  it('contacts register and scale with impact angle', () => {
    const g = wallHit(10), m = wallHit(30), h = wallHit(60);
    expect(g.hits + m.hits + h.hits).toBeGreaterThan(0);
    expect(h.stun).toBeGreaterThanOrEqual(m.stun);
  });
});
