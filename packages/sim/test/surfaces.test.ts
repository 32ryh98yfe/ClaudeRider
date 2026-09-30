// Surfaces and zones (10-sim-spec §13.1–§13.2, §7.6, §10.3): grip, top speed, coast drag, conveyors, pads, lava,
// and the zone kinds the sim acts on (conveyor, surface, kill, noItem, gravity).
import { describe, expect, it } from 'vitest';
import { SURFACE_IDS, SURFACE_FX, surfaceFx, SURFACES, type SurfaceId } from '@cr/content';
import { Boost, type ZoneBaked } from '@cr/sim';
import { isNoItem } from '../src/kart/zones.ts';
import { getContent } from './rig.ts';
import { strip } from './fixtures/kits.ts';
import { racingRig, place, fwdKmh, speedOf } from './util.ts';

const TABLE: Record<SurfaceId, [number, number, number]> = {
  asphalt: [1, 1, 1], stone: [1, 1, 1], cobble: [0.98, 1, 1], dirt: [0.92, 0.97, 1.2], sand: [0.85, 0.92, 1.6], gravel: [0.85, 0.94, 1.4],
  ice: [0.75, 1, 0.8], snow: [0.9, 0.95, 1.2], grass: [0.8, 0.6, 2.2], wet: [0.92, 1, 1], wood: [0.98, 1, 1], metal: [0.97, 1, 1],
  basalt: [0.97, 1, 1], obsidian: [0.95, 1, 1], glass: [0.96, 1, 1], boost_pad: [1, 1, 1], jump_pad: [1, 1, 1],
  conveyor_fwd: [1, 1, 1], conveyor_back: [1, 1, 1], lava: [1, 1, 1], rail: [1, 1, 1],
};

/** Full throttle from rest for `ticks` on a strip of `id`; returns final forward speed (m/s). */
function topSpeed(id: SurfaceId, ticks = 720): number {
  const rig = racingRig(strip(id).track);
  const k = place(rig, 0, { s: 150, speed: 0 });
  rig.run(ticks, (_w, inp) => { inp[0]!.throttle = 15; });
  return fwdKmh(k) / 5.4;
}

describe('surface table (§13.1)', () => {
  it('every SURFACE_ID has grip / vMul / dragMul per the spec, a wire code and renderer hints', () => {
    const c = getContent();
    for (const id of SURFACE_IDS) {
      const d = SURFACES.find((s) => s.id === id)!;
      expect(d, id).toBeDefined();
      expect(d.code).toBe(SURFACE_IDS.indexOf(id) + 1);
      expect(c.surfaceByCode[d.code]).toBe(d);
      expect([d.grip, d.vMul, d.dragMul], id).toEqual(TABLE[id]);
      expect(SURFACE_FX[id].particle).toBeTypeOf('string');
      expect(surfaceFx(d.code)).toBe(SURFACE_FX[id]);
    }
    expect(SURFACES.find((s) => s.id === 'lava')!.kill).toBe(true);
    expect(SURFACES.find((s) => s.id === 'conveyor_fwd')!.conveyor).toBe(1.15);
    expect(SURFACES.find((s) => s.id === 'conveyor_back')!.conveyor).toBe(0.85);
    expect(surfaceFx(0)).toBe(SURFACE_FX.asphalt); // unknown codes fall back, never crash
  });
});

describe('surface behaviour', () => {
  it.each(['grass', 'sand', 'gravel', 'dirt', 'snow', 'asphalt'] as const)('%s: top speed = vGrip·vMul', (id) => {
    const v = topSpeed(id);
    expect(v / (34 * TABLE[id][1])).toBeGreaterThan(0.99);
    expect(v / (34 * TABLE[id][1])).toBeLessThan(1.003);
  });

  it.each(['asphalt', 'sand', 'grass', 'ice'] as const)('%s: coasting decelerates at 2.5·dragMul m/s²', (id) => {
    const rig = racingRig(strip(id).track);
    const k = place(rig, 0, { s: 300, speed: 18 });
    rig.run(30, () => { /* no throttle */ });
    const decel = (18 - fwdKmh(k) / 5.4) / 0.5;
    expect(decel).toBeCloseTo(2.5 * TABLE[id][2], 1);
  });

  it('ice keeps more lateral slide than asphalt (grip scales the lateral damping)', () => {
    const lateral = (id: SurfaceId): number => {
      const rig = racingRig(strip(id).track);
      const k = place(rig, 0, { s: 300, speed: 25 });
      // velocity 20° to the left of the nose
      const a = (20 * Math.PI) / 180;
      k.body.vx = 25 * Math.cos(a); k.body.vz = -25 * Math.sin(a);
      rig.run(6, (_w, inp) => { inp[0]!.throttle = 15; });
      const lx = -k.body.fz, lz = k.body.fx; // left = up × forward
      return Math.abs(k.body.vx * -lx + k.body.vz * -lz);
    };
    expect(lateral('ice')).toBeGreaterThan(lateral('asphalt') * 1.3);
  });

  it('conveyor surfaces scale the target speed ×1.15 / ×0.85', () => {
    expect(topSpeed('conveyor_fwd') / (34 * 1.15)).toBeGreaterThan(0.99);
    expect(topSpeed('conveyor_back') / (34 * 0.85)).toBeLessThan(1.003);
    expect(topSpeed('conveyor_back') / (34 * 0.85)).toBeGreaterThan(0.99);
  });

  it('a boost pad grants a 45-tick pad boost on entry (no booster consumed)', () => {
    const rig = racingRig(strip('boost_pad', { from: 300, to: 306 }).track);
    const k = place(rig, 0, { s: 280, speed: 30 });
    k.drive.boosters = 1;
    let boosted = 0, maxV = 0, entry = -1;
    for (let t = 0; t < 150; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      if (entry < 0 && rig.events.some((e) => e.t === 'boostStart')) entry = t;
      // count the dynamics phases that ran boosted (the pad is entered in phase 4 of the entry tick)
      else if (entry >= 0 && k.drive.boostTicks > 0) { boosted++; maxV = Math.max(maxV, speedOf(k)); }
    }
    const starts = rig.events.filter((e) => e.t === 'boostStart');
    expect(starts.length).toBe(1);
    expect(starts[0]!.t === 'boostStart' && starts[0]!.kind).toBe(Boost.PAD);
    expect(boosted).toBe(45);
    expect(k.drive.boosters).toBe(1);
    expect(maxV).toBeGreaterThan(37);
  });

  it('a jump pad launches the kart to ≥ 9 m/s along its up, then it lands', () => {
    const rig = racingRig(strip('jump_pad', { from: 300, to: 304 }).track);
    const k = place(rig, 0, { s: 285, speed: 25 });
    let maxVy = 0, airTicks = 0;
    for (let t = 0; t < 120; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      maxVy = Math.max(maxVy, k.body.vy);
      if (!k.body.grounded) airTicks++;
    }
    expect(maxVy).toBeGreaterThanOrEqual(8.5);
    expect(airTicks).toBeGreaterThan(30); // 2·9/28 s ≈ 38 ticks of flight
    expect(airTicks).toBeLessThan(48);
    expect(rig.events.some((e) => e.t === 'land')).toBe(true);
    expect(k.body.grounded).toBe(1);
  });

  it('lava is a kill surface: entering it starts a respawn', () => {
    const rig = racingRig(strip('lava', { from: 300, to: 400 }).track);
    const k = place(rig, 0, { s: 285, speed: 25 });
    rig.run(60, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(k.stats.respawns).toBe(1);
    expect(rig.events.some((e) => e.t === 'respawn' && e.phase === 'out')).toBe(true);
  });
});

describe('zones (§13.2)', () => {
  const Z = (kind: ZoneBaked['kind'], s0: number, s1: number, extra: Partial<ZoneBaked> = {}): ZoneBaked => ({ kind, path: 0, s0, s1, u0: -12, u1: 12, ...extra });

  it('conveyor zone: vT × speedMul inside the (s, u) box only', () => {
    const t = strip('asphalt', { key: 'conv', zones: [Z('conveyor', 200, 1000, { speedMul: 1.2 })] }).track;
    const rig = racingRig(t);
    const k = place(rig, 0, { s: 210, speed: 34 });
    rig.run(600, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(fwdKmh(k) / 5.4).toBeGreaterThan(34 * 1.2 * 0.99);
    // past the box the target speed is back to vGrip
    rig.run(900, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(k.race.loc.s).toBeGreaterThan(1000);
    expect(fwdKmh(k) / 5.4).toBeLessThan(34 * 1.01);
  });

  it('surface zone overrides the triangle surface (grass on asphalt caps the speed at 0.6·vGrip)', () => {
    const t = strip('asphalt', { key: 'surfz', zones: [Z('surface', 200, 1000, { surf: SURFACE_IDS.indexOf('grass') + 1 })] }).track;
    const rig = racingRig(t);
    const k = place(rig, 0, { s: 210, speed: 34 });
    rig.run(600, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(fwdKmh(k) / 5.4).toBeLessThan(0.6 * 34 * 1.01);
  });

  it('kill zone triggers a respawn; with belowY only below that plane', () => {
    const t = strip('asphalt', { key: 'kill', zones: [Z('kill', 400, 420), Z('kill', 600, 700, { belowY: -1 })] }).track;
    const rig = racingRig(t);
    const k = place(rig, 0, { s: 380, speed: 30 });
    rig.run(60, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(k.stats.respawns).toBe(1);
    const r2 = racingRig(t), k2 = place(r2, 0, { s: 580, speed: 30 });
    r2.run(120, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(k2.stats.respawns).toBe(0); // on the road above belowY
  });

  it('noItem zones are reported to the item runtime', () => {
    const t = strip('asphalt', { key: 'noitem', zones: [Z('noItem', 500, 550)] }).track;
    const rig = racingRig(t);
    const k = place(rig, 0, { s: 520, speed: 0 });
    expect(isNoItem(t, k.race.loc)).toBe(true);
    const k2 = place(rig, 0, { s: 600, speed: 0 });
    expect(isNoItem(t, k2.race.loc)).toBe(false);
  });

  it('gravity zone (low, scale 0.5) halves the fall acceleration', () => {
    const t = strip('asphalt', { key: 'lowg', zones: [Z('gravity', 400, 600, { gravMode: 2, gravScale: 0.5 })] }).track;
    const fall = (s: number): number => {
      const rig = racingRig(t);
      place(rig, 0, { s, h: 10, speed: 0 });
      for (let i = 1; i < 200; i++) { rig.tick(); if (rig.events.some((e) => e.t === 'land')) return i; }
      return -1;
    };
    const world = fall(300), low = fall(500);
    expect(world).toBeGreaterThan(48); expect(world).toBeLessThan(54);   // √(2·10/28) s ≈ 51 ticks
    expect(low).toBeGreaterThan(69); expect(low).toBeLessThan(75);       // √(2·10/14) s ≈ 72 ticks
  });
});
