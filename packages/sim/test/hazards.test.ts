// Track hazards on the F5 bake (10-sim-spec §13.6): each kind hits with its effect (source 255), deterministically;
// hard-CC immunity and refresh follow L2's rules; one contact is one hit; shields and halos do not block hazards.
import { describe, expect, it } from 'vitest';
import { AI_TIERS, Phase, hashWorld, type HazardPose, type SimEvent, type TrackLoc } from '@cr/sim';
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
