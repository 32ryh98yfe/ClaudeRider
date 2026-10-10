// Track hazards on the F5 bake (10-sim-spec §13.6): each kind hits with its effect (source 255), deterministically;
// hard-CC immunity and refresh follow L2's rules; one contact is one hit; shields and halos do not block hazards.
import { readFileSync } from 'node:fs';
import { loadContent } from '@cr/content';
import { describe, expect, it } from 'vitest';
import { AI_TIERS, Phase, hashWorld, loadCtrk, toArrayBuffer, type HazardPose, type SimEvent, type TrackLoc } from '@cr/sim';
import { bakedTrack, makeRig } from './rig.ts';
import { racingRig, place, speedOf } from './util.ts';
import { EF } from '../src/items/codes.ts';
import { resolveEffect, scheduleEffect } from '../src/items/effects.ts';
import { SQUASH_TICKS, TRACK_SOURCE } from '../src/race/trackhazards.ts';
import type { Rig } from './rig.ts';

const T = bakedTrack('_test/f5_hazards');
const byName = (n: string): number => T.hazards.findIndex((h) => h.name === n);
const pose = (): HazardPose => ({ x: 0, y: 0, z: 0, active: 0, telegraph: 0 });

type Hit = { tick: number; effect: number; result: string };
function hits(ev: SimEvent[], slot = 0): Hit[] {
  return ev.filter((e) => e.t === 'effect' && e.victim === slot && e.source === TRACK_SOURCE)
    .map((e) => ({ tick: e.tick, effect: (e as { effect: number }).effect, result: (e as { result: string }).result }));
}

/** Parks kart 0 far from every hazard until hazard `i` is live on the next tick, then puts it (at rest) on its pose. */
function meet(rig: Rig, i: number): TrackLoc {
  const k = rig.w.karts[0]!, p = pose();
  place(rig, 0, { s: 40, speed: 0 });
  const loc: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 };
  const h = T.hazards[i]!;
  let found = false;
  for (let n = 0; n < 6000 && !found; n++) {
    T.hazardPose(i, rig.w.tick + 1, p);
    // live, over the road (moving hazards cross it), and for timed hazards 20 ticks into the window so the contact
    // is not on its last live tick
    const P = h.periodTicks, ph = (((rig.w.tick + 1 + h.offsetTicks) % P) + P) % P;
    found = p.active === 1 && (h.activeTo - h.activeFrom >= P || ph - h.activeFrom >= 20) && T.locateGlobal(p.x, p.y, p.z, loc) && Math.abs(loc.u) < 7;
    if (!found) { rig.tick(); place(rig, 0, { s: 40, speed: 0 }); }
  }
  expect(found).toBe(true);
  place(rig, 0, { s: loc.s, u: loc.u, speed: 0 });
  void k;
  return loc;
}

function hitOnce(name: string): { hit: Hit[]; speed: number; ccTicks: number } {
  const rig = racingRig(T);
  meet(rig, byName(name));
  const n0 = rig.events.length;
  rig.tick();
  const k = rig.w.karts[0]!;
  return { hit: hits(rig.events.slice(n0)), speed: speedOf(k), ccTicks: k.status.ccEnd - k.status.ccStart };
}

describe('track hazards (§13.6, F5 fixture)', () => {
  it('the fixture has every kind', () => {
    for (const kind of ['geyser', 'press', 'train', 'traffic', 'swinger'] as const) expect(T.hazards.some((h) => h.kind === kind), kind).toBe(true);
  });

  it('geyser → airborne 66 ticks', () => {
    const r = hitOnce('vent1');
    expect(r.hit).toEqual([expect.objectContaining({ effect: EF.airborne, result: 'hit' })]);
    expect(r.ccTicks).toBe(66);
  });

  it('press → stun 45 ticks and speed ×0.3 at contact', () => {
    const rig = racingRig(T);
    const loc = meet(rig, byName('stamp'));
    place(rig, 0, { s: loc.s, u: loc.u, speed: 20 });
    const n0 = rig.events.length;
    rig.tick();
    const k = rig.w.karts[0]!;
    expect(hits(rig.events.slice(n0))).toEqual([expect.objectContaining({ effect: EF.stun, result: 'hit' })]);
    expect(k.status.ccEnd - k.status.ccStart).toBe(SQUASH_TICKS);
    expect(speedOf(k) / 20).toBeGreaterThan(0.27);
    expect(speedOf(k) / 20).toBeLessThan(0.31);
  });

  it('train → spin 60 ticks + 8 m/s push; traffic → spin + 6 m/s push; swingers → spin, no push', () => {
    const train = hitOnce('freight');
    expect(train.hit).toEqual([expect.objectContaining({ effect: EF.spin, result: 'hit' })]);
    expect(train.ccTicks).toBe(60);
    expect(train.speed).toBeCloseTo(8, 0);
    const car = hitOnce('cars');
    expect(car.hit).toEqual([expect.objectContaining({ effect: EF.spin, result: 'hit' })]);
    expect(car.speed).toBeCloseTo(6, 0);
    for (const n of ['pendulum', 'sweeper']) {
      const s = hitOnce(n);
      expect(s.hit, n).toEqual([expect.objectContaining({ effect: EF.spin, result: 'hit' })]);
      expect(s.speed, n).toBeLessThan(1);
    }
  });

  it('an idle hazard does not collide: the press while raised, a geyser between eruptions', () => {
    const rig = racingRig(T);
    const i = byName('vent1'), h = T.hazards[i]!, p = pose();
    place(rig, 0, { s: 40, speed: 0 });
    while (true) { T.hazardPose(i, rig.w.tick + 1, p); if (!p.active) break; rig.tick(); }
    place(rig, 0, { s: h.s, u: h.u, speed: 0 });
    const n0 = rig.events.length;
    rig.tick();
    expect(hits(rig.events.slice(n0))).toEqual([]);
  });

  it('one contact is one hit: a kart held in a geyser is launched once per eruption, then immune', () => {
    const rig = racingRig(T);
    const i = byName('vent1'), h = T.hazards[i]!;
    meet(rig, i);
    const n0 = rig.events.length;
    for (let t = 0; t < 2 * h.periodTicks; t++) rig.tick((w) => {
      // keep the kart on the vent (kinematics would slide it off)
      const k = w.karts[0]!;
      const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
      T.frameAt(0, h.s, f);
      k.body.px = f.px + f.rx * h.u; k.body.py = f.py + f.ry * h.u; k.body.pz = f.pz + f.rz * h.u;
    });
    const all = hits(rig.events.slice(n0));
    // one hit per eruption (cycle), every one a clean hit (no stream of `immune` results)
    const cycle = (t: number): number => Math.floor((t + h.offsetTicks) / h.periodTicks);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.every((x) => x.result === 'hit' && x.effect === EF.airborne)).toBe(true);
    expect(new Set(all.map((x) => cycle(x.tick))).size).toBe(all.length);
    const t0 = all[0]!.tick, cycles = new Set<number>();
    for (let t = t0; t < t0 + 2 * h.periodTicks - 1; t++) { const ph = (t + h.offsetTicks) % h.periodTicks; if (ph >= h.activeFrom && ph < h.activeTo) cycles.add(cycle(t)); }
    expect(all.length).toBe(cycles.size);
  });

  it('immune karts are not hit; a running item CC is refreshed by the hazard (L2 rules); shields do not block', () => {
    // immune
    let rig = racingRig(T);
    meet(rig, byName('vent1'));
    rig.w.karts[0]!.status.immuneUntil = rig.w.tick + 30;
    let n0 = rig.events.length;
    rig.tick();
    expect(hits(rig.events.slice(n0))).toEqual([]);
    // an item spin (source 1) running: the later-ending airborne takes over
    rig = racingRig(T, { slots: [{}, {}] });
    meet(rig, byName('vent1'));
    const e = scheduleEffect(rig.w, rig.ctx, EF.spin, 0, 1, rig.w.tick, 30, 0, 0, 12345)!;
    expect(resolveEffect(rig.w, rig.ctx, e)).toBe(0);
    n0 = rig.events.length;
    rig.tick();
    expect(hits(rig.events.slice(n0))).toEqual([expect.objectContaining({ effect: EF.airborne, result: 'hit' })]);
    expect(rig.w.karts[0]!.status.cc).toBe(EF.airborne);
    // shield and halo stay up and do not block
    rig = racingRig(T);
    meet(rig, byName('freight'));
    const st = rig.w.karts[0]!.status;
    st.shieldUntil = rig.w.tick + 600; st.haloUntil = rig.w.tick + 600;
    const shield = st.shieldUntil;
    n0 = rig.events.length;
    rig.tick();
    expect(hits(rig.events.slice(n0))).toEqual([expect.objectContaining({ effect: EF.spin, result: 'hit' })]);
    expect(st.shieldUntil).toBe(shield);
  });

  it('an 8-bot race through every hazard is deterministic and the hazards do hit', () => {
    const run = (): { hash: number; hits: number } => {
      const slots = Array.from({ length: 8 }, (_, i) => ({ kind: 'bot' as const, name: `b${i}`, ai: 'racer' as const, vMul: AI_TIERS.racer.vMul }));
      const rig = makeRig(T, { slots, seed: 99 });
      let n = 0;
      while (rig.w.phase !== Phase.DONE && rig.w.tick < 60 * 60 * 4) {
        rig.tick();
        for (const e of rig.events) if (e.t === 'effect' && e.source === TRACK_SOURCE && e.result === 'hit') n++;
        rig.events.length = 0;
      }
      return { hash: hashWorld(rig.w), hits: n };
    };
    const a = run(), b = run();
    expect(b.hash).toBe(a.hash);
    expect(a.hits).toBeGreaterThan(0);
  });
});

// Contact trajectories deliberately begin and end outside each shape. Endpoint-only contact used to miss every
// one of these; a tick-local sweep must also survive alternating authority/predictor worlds without shared history.
describe('continuous track hazard contacts', () => {
  function single(shape: 'box' | 'sphere' | 'cyl', effect: 'block' | 'spin' = 'spin') {
    const track = Object.create(T) as typeof T;
    Object.defineProperty(track, 'hazards', { value: [{ ...T.hazards[0]!, id: 0, kind: 'press', shape, size: shape === 'box' ? [0.1, 4, 2] : [0.1, 2, 0], effect, s: 100, u: 0, periodTicks: 60, activeFrom: 0, activeTo: 60, offsetTicks: 0, motion: undefined }] });
    return racingRig(track);
  }

  it.each(['box', 'sphere', 'cyl'] as const)('sweeps through a thin %s without endpoint overlap', async (shape) => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single(shape), f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
    r.track.frameAt(0, 100, f);
    const k = place(r, 0, { s: 98, speed: 0 });
    captureTrackHazardMotion(r.w);
    k.body.px += f.tx * 4; k.body.py += f.ty * 4; k.body.pz += f.tz * 4;
    stepTrackHazards(r.w, r.ctx);
    expect(k.status.cc).toBe(EF.spin);
  });

  it('stops on the near side of a thin solid hazard instead of pushing out the far face', async () => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('box', 'block'), k = place(r, 0, { s: 98, speed: 40 });
    const start = { x: k.body.px, y: k.body.py, z: k.body.pz }, b = k.body;
    captureTrackHazardMotion(r.w);
    b.px += b.fx * 4; b.py += b.fy * 4; b.pz += b.fz * 4;
    stepTrackHazards(r.w, r.ctx);
    const moved = (b.px - start.x) * b.fx + (b.py - start.y) * b.fy + (b.pz - start.z) * b.fz;
    expect(moved).toBeGreaterThan(1); expect(moved).toBeLessThan(1.2);
    expect(speedOf(k)).toBeLessThan(0.001); expect(b.wallContact).toBe(1);
  });

  it('lets a touching kart slide along a block and drive away on the next tick', async () => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('box', 'block'), k = place(r, 0, { s: 99.1, speed: 0 }), b = k.body;
    const x0 = b.px, z0 = b.pz, fx = b.fx, fz = b.fz;
    captureTrackHazardMotion(r.w);
    // Sideways motion on the near face must retain its whole displacement.
    b.px += fz * 0.5; b.pz -= fx * 0.5;
    stepTrackHazards(r.w, r.ctx);
    expect((b.px - x0) * fz - (b.pz - z0) * fx).toBeCloseTo(0.5, 4);
    const beforeX = b.px, beforeZ = b.pz;
    captureTrackHazardMotion(r.w); b.px -= fx; b.pz -= fz;
    stepTrackHazards(r.w, r.ctx);
    expect((b.px - beforeX) * fx + (b.pz - beforeZ) * fz).toBeCloseTo(-1, 4);
  });

  it('solid physical bodies keep colliding while effect immunity is active', async () => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('box', 'spin'), h = r.track.hazards[0]!, k = place(r, 0, { s: 98, speed: 40 });
    h.contact = 'solid'; h.kind = 'traffic'; k.status.immuneUntil = r.w.tick + 60;
    const b = k.body, x = b.px, z = b.pz, fx = b.fx, fz = b.fz;
    captureTrackHazardMotion(r.w); b.px += fx * 4; b.pz += fz * 4;
    stepTrackHazards(r.w, r.ctx);
    expect((b.px - x) * fx + (b.pz - z) * fz).toBeLessThan(1.2);
    expect(b.wallContact).toBe(1); expect(k.status.cc).toBe(0);
  });

  it('trigger volumes apply their effect without turning a plume into a solid road barrier', async () => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('cyl', 'spin'), h = r.track.hazards[0]!, k = place(r, 0, { s: 98, speed: 40 });
    h.contact = 'trigger'; h.kind = 'geyser'; h.effect = 'launch';
    const b = k.body, x = b.px, z = b.pz, fx = b.fx, fz = b.fz;
    captureTrackHazardMotion(r.w); b.px += fx * 4; b.pz += fz * 4;
    stepTrackHazards(r.w, r.ctx);
    expect((b.px - x) * fx + (b.pz - z) * fz).toBeCloseTo(4, 5);
    expect(k.status.cc).toBe(EF.airborne);
  });

  it('solid low swingers eject sideways instead of pushing an immune kart below its road', async () => {
    const { stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('cyl', 'spin'), h = r.track.hazards[0]!, k = place(r, 0, { s: 100, speed: 0 });
    h.contact = 'solid'; h.kind = 'swinger'; h.size = [1.75, 1, 0]; h.h = 1.5;
    k.status.immuneUntil = r.w.tick + 60;
    const beforeY = k.body.py;
    stepTrackHazards(r.w, r.ctx);
    expect(k.body.py).toBeGreaterThanOrEqual(beforeY - 0.001);
    expect(k.body.wallContact).toBe(1); expect(k.status.cc).toBe(0);
  });

  it('an immune kart squeezed by a crossing train exits along the road instead of through the guardrail', async () => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('box', 'spin'), h = r.track.hazards[0]!;
    h.kind = 'train'; h.contact = 'solid'; h.size = [12, 4, 3]; h.periodTicks = 100; h.activeTo = 100;
    h.motion = { type: 'cross', halfSpan: 25 };
    r.w.tick = 53;
    const k = place(r, 0, { s: 100, u: 6.9, speed: 0 }), b = k.body;
    k.status.immuneUntil = r.w.tick + 60;
    captureTrackHazardMotion(r.w); stepTrackHazards(r.w, r.ctx);
    expect(r.track.locateGlobal(b.px, b.py, b.pz, k.race.loc)).toBe(true);
    expect(k.race.loc.u).toBeLessThan(7.16);
    expect(Math.abs(k.race.loc.s - 100)).toBeGreaterThan(2.8);
    expect(r.track.sphereWalls(b.px + b.nx * 0.6, b.py + b.ny * 0.6, b.pz + b.nz * 0.6, 0.8, r.ctx.scratch.contacts, 1)).toBe(0);
    expect(b.py).toBeGreaterThan(-0.01); expect(k.status.cc).toBe(0);
  });

  it('a raised visible press remains solid without applying its inactive crushing effect', async () => {
    const { stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('box', 'spin'), h = r.track.hazards[0]!;
    h.contact = 'solid'; h.kind = 'press'; h.effect = 'squash'; h.activeFrom = 30; h.activeTo = 40;
    h.motion = { type: 'piston', rise: 4, rampTicks: 6 };
    const k = place(r, 0, { s: 100, h: 4, speed: 0 });
    stepTrackHazards(r.w, r.ctx);
    expect(k.body.wallContact).toBe(1); expect(k.status.cc).toBe(0);
    const ground = single('box', 'spin'); Object.assign(ground.track.hazards[0]!, h);
    const g = place(ground, 0, { s: 100, speed: 0 }); stepTrackHazards(ground.w, ground.ctx);
    expect(g.body.wallContact).toBe(0); expect(g.status.cc).toBe(0);
  });

  it('keeps motion scratch separate for interleaved worlds and reuses no history without capture', async () => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const a = single('box'), b = single('box');
    const ka = place(a, 0, { s: 98, speed: 0 });
    captureTrackHazardMotion(a.w);
    place(b, 0, { s: 150, speed: 0 }); captureTrackHazardMotion(b.w);
    ka.body.px += ka.body.fx * 4; ka.body.py += ka.body.fy * 4; ka.body.pz += ka.body.fz * 4;
    stepTrackHazards(a.w, a.ctx); stepTrackHazards(b.w, b.ctx);
    expect(ka.status.cc).toBe(EF.spin); expect(b.w.karts[0]!.status.cc).toBe(0);
    const c = single('box'); place(c, 0, { s: 102, speed: 0 }); stepTrackHazards(c.w, c.ctx);
    expect(c.w.karts[0]!.status.cc).toBe(0);
  });

  it('checks active windows during movement and does not sweep traffic teleports', async () => {
    const { captureTrackHazardMotion, stepTrackHazards } = await import('../src/race/trackhazards.ts');
    const r = single('box'), h = r.track.hazards[0]!;
    h.activeFrom = 30; h.activeTo = 40;
    const k = place(r, 0, { s: 98, speed: 0 }); captureTrackHazardMotion(r.w);
    k.body.px += k.body.fx * 4; k.body.py += k.body.fy * 4; k.body.pz += k.body.fz * 4;
    stepTrackHazards(r.w, r.ctx); expect(k.status.cc).toBe(0);
    h.kind = 'traffic'; h.periodTicks = 60; h.offsetTicks = 0; h.motion = { type: 'lane', speed: 600, s0: 90, s1: 110 };
    r.w.tick = 60; place(r, 0, { s: 100, speed: 0 }); captureTrackHazardMotion(r.w);
    stepTrackHazards(r.w, r.ctx); expect(k.status.cc).toBe(0);
    r.w.tick = 2; place(r, 0, { s: 95, speed: 0 }); captureTrackHazardMotion(r.w);
    stepTrackHazards(r.w, r.ctx); expect(k.status.cc).toBe(0);
  });
});


it('every authored public-track hazard resolves its declared effect on actual contact', async () => {
  const { stepTrackHazards } = await import('../src/race/trackhazards.ts');
  const kinds = new Set<string>(), effects = new Set<string>();
  let checked = 0;
  for (const entry of loadContent().tracks.all) {
    const source = loadCtrk(toArrayBuffer(readFileSync(new URL(`../../../apps/client/public/tracks/${entry.id}.ctrk`, import.meta.url))));
    for (const hazard of source.hazards) {
      const track = Object.create(source) as typeof T;
      Object.defineProperty(track, 'hazards', { value: [{ ...hazard, id: 0 }] });
      const rig = racingRig(track), k = rig.w.karts[0]!, p = pose();
      // The middle of the active phase avoids the piston approach/retract, but uses the real authored motion.
      rig.w.tick = hazard.periodTicks * 2 + Math.floor((hazard.activeFrom + hazard.activeTo) / 2) - hazard.offsetTicks;
      track.hazardPose(0, rig.w.tick, p); expect(p.active, `${entry.id}/${hazard.name}`).toBe(1);
      k.body.px = p.x; k.body.py = p.y - 0.6; k.body.pz = p.z;
      k.body.nx = 0; k.body.ny = 1; k.body.nz = 0;
      stepTrackHazards(rig.w, rig.ctx);
      if (hazard.effect === 'block') expect(k.body.wallContact, `${entry.id}/${hazard.name}`).toBe(1);
      else expect(k.status.cc, `${entry.id}/${hazard.name}`).toBe(hazard.effect === 'launch' ? EF.airborne : hazard.effect === 'squash' ? EF.stun : EF.spin);
      kinds.add(hazard.kind); effects.add(hazard.effect); checked++;
    }
  }
  expect([...kinds].sort()).toEqual(['geyser', 'press', 'swinger', 'traffic', 'train']);
  expect([...effects].sort()).toEqual(['block', 'launch', 'spin', 'squash']);
  expect(checked).toBeGreaterThan(25);
});

it.each([2.3, 6])('a descending Manor bookcase at road offset %sm uses a supported exit without crossing a wall or the floor', (u) => {
  const track = loadCtrk(toArrayBuffer(readFileSync(new URL('../../../apps/client/public/tracks/manor_catacombs.ctrk', import.meta.url))));
  const h = track.hazards.find(x => x.name === 'bookcase')!;
  const rig = racingRig(track), k = place(rig, 0, { s: h.s - 0.5, u, speed: 0 });
  rig.w.tick = h.periodTicks * 7 - 1;
  const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  let contacted = false;
  for (let n = 0; n < 90; n++) {
    rig.tick();
    const b = k.body;
    track.frameAt(k.race.loc.path, k.race.loc.s, f);
    const height = (b.px - f.px) * f.ux + (b.py - f.py) * f.uy + (b.pz - f.pz) * f.uz;
    expect(height, `tick ${rig.w.tick}: foot below floor`).toBeGreaterThan(-0.02);
    expect(b.grounded, `tick ${rig.w.tick}: lost supporting road`).toBe(1);
    expect(k.race.respawnPhase).toBe(0);
    expect(k.race.loc.u).toBeLessThanOrEqual(f.wR - 0.83);
    expect(k.race.loc.u).toBeGreaterThanOrEqual(-f.wL + 0.83);
    expect(track.sphereWalls(b.px + b.nx * 0.6, b.py + b.ny * 0.6, b.pz + b.nz * 0.6, 0.80, rig.ctx.scratch.contacts, 1)).toBe(0);
    contacted ||= b.wallContact === 1;
  }
  expect(contacted).toBe(true);
  expect(k.stats.respawns).toBe(0);
});
