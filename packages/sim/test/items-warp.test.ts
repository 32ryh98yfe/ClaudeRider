// Committed hard CC must use physical entry speed, not a warp's frozen-velocity
// placeholder, while keeping the original hit/end times and transit position.
import { describe, expect, it } from 'vitest';
import { Attach, cloneWorld, copyWorld, hashWorld } from '@cr/sim';
import { EF, EFlag } from '../src/items/codes.ts';
import { ccImpactSpeed, scheduleEffect } from '../src/items/effects.ts';
import { bakedTrack } from './rig.ts';
import { flatPlane } from './fixtures/kits.ts';
import { place, racingRig, speedOf } from './util.ts';

describe('committed airborne CC across warp transit', () => {
  it('keeps Manor on supported ground when a committed trap stops the kart immediately after exit', () => {
    const track = bakedTrack('lantern_hollow/manor_catacombs');
    const gate = track.warps.find((warp) => warp.id === 'portal')!;
    const rig = racingRig(track, { mode: 'item', slots: [{}, {}] });
    const kart = place(rig, 0, { s: gate.s - 1, speed: 25 });
    place(rig, 1, { s: gate.s - 100, u: 4, speed: 0 });
    const tick = () => rig.tick((_world, inputs) => { inputs[0]!.throttle = 15; });
    while (kart.body.attachKind !== Attach.WARP && rig.w.tick < 30) tick();
    expect(kart.body.attachKind).toBe(Attach.WARP);
    const impactTick = rig.w.tick + 17, duration = 84;
    scheduleEffect(rig.w, rig.ctx, EF.trap_bug, 0, 1, impactTick, duration, 0, EFlag.BLOCKABLE, 903);
    while (kart.body.attachKind === Attach.WARP) tick();
    expect(kart.status.cc).toBe(EF.trap_bug);
    const exitS = kart.race.loc.s;
    const body = kart.body;
    const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
    expect(track.groundRay(body.px + body.nx, body.py + body.ny, body.pz + body.nz, -body.nx, -body.ny, -body.nz, 2, hit)).toBe(true);
    // A trap past its 12-tick deceleration must really stop the kart; the exit
    // cannot depend on retained forward momentum to reach collision geometry.
    for (let n = 0; n < 10; n++) {
      tick();
      expect(kart.status.cc).toBe(EF.trap_bug);
      expect(speedOf(kart)).toBeLessThan(0.02);
      expect(body.grounded).toBe(1);
      expect(kart.race.noGroundTicks).toBe(0);
      expect(Math.abs(kart.race.loc.s - exitS)).toBeLessThan(0.02);
    }
    while (rig.w.tick < impactTick + duration + 90) tick();
    expect(kart.status.cc).toBe(0);
    expect(kart.stats.respawns).toBe(0);
    expect(kart.race.loc.s).toBeGreaterThan(exitS + 10);
    expect(rig.events.filter((event) => event.t === 'effect' && event.victim === 0 && event.effect === EF.trap_bug)).toMatchObject([{ tick: impactTick, result: 'hit' }]);
    expect(rig.events.filter((event) => event.t === 'effectEnd' && event.victim === 0 && event.effect === EF.trap_bug)).toMatchObject([{ tick: impactTick + duration - 1 }]);
  });

  it('captures entry speed, stays frozen in transit, and travels normally after exit while CC remains active', () => {
    const track = bakedTrack('_test/f4_rails');
    const gate = track.warps.find((warp) => warp.id === 'gate')!;
    const rig = racingRig(track, { mode: 'item', slots: [{}, {}] });
    const kart = place(rig, 0, { s: gate.s - 1, speed: 30 });
    place(rig, 1, { s: gate.s - 100, u: 4, speed: 0 });
    const impactTick = rig.w.tick + 12, duration = 66;
    const effect = scheduleEffect(rig.w, rig.ctx, EF.airborne, 0, 1, impactTick, duration, 0, EFlag.BLOCKABLE, 901)!;
    const tick = () => rig.tick((_world, inputs) => { inputs[0]!.throttle = 15; });
    while (kart.body.attachKind !== Attach.WARP && rig.w.tick < impactTick) tick();
    expect(kart.body.attachKind).toBe(Attach.WARP);
    const entryTick = rig.w.tick, entrySpeed = kart.body.attachS;
    const entryPosition = [kart.body.px, kart.body.py, kart.body.pz];
    expect(entrySpeed).toBeGreaterThan(29);
    while (rig.w.tick < impactTick) tick();
    expect(kart.status.cc).toBe(EF.airborne);
    expect(effect.param / 4096).toBe(entrySpeed);
    expect(effect.start).toBe(impactTick);
    expect(effect.end).toBe(impactTick + duration);
    expect(rig.events.filter((event) => event.t === 'effect' && event.victim === 0 && event.effect === EF.airborne)).toMatchObject([{ tick: impactTick, result: 'hit' }]);
    const checkpoint = cloneWorld(rig.w);

    let exitTick = -1, exitS = 0, ccTravelTicks = 0;
    const hashes: number[] = [];
    for (let n = 0; n < 100; n++) {
      tick();
      if (kart.body.attachKind === Attach.WARP) {
        expect([kart.body.px, kart.body.py, kart.body.pz]).toEqual(entryPosition);
        expect(speedOf(kart)).toBe(0);
        expect(kart.body.attachS).toBe(entrySpeed);
      } else if (exitTick < 0) {
        exitTick = rig.w.tick; exitS = kart.race.loc.s;
        expect(exitTick - entryTick).toBe(gate.transitTicks);
        expect(kart.status.cc).toBe(EF.airborne);
        expect(speedOf(kart)).toBeCloseTo(entrySpeed, 2);
      } else if (kart.status.cc === EF.airborne) {
        ccTravelTicks++;
        expect(ccImpactSpeed(rig.w, kart)).toBe(entrySpeed);
        expect(speedOf(kart)).toBeGreaterThan(entrySpeed * 0.25 - 0.01);
      }
      hashes.push(hashWorld(rig.w));
    }
    expect(ccTravelTicks).toBeGreaterThan(10);
    expect(kart.race.loc.s).toBeGreaterThan(exitS + 10);
    expect(kart.stats.respawns).toBe(0);
    expect(rig.events.filter((event) => event.t === 'effectEnd' && event.victim === 0 && event.effect === EF.airborne)).toMatchObject([{ tick: impactTick + duration - 1 }]);
    // The existing effect parameter and attachment state survive a checkpoint;
    // no additional hidden state is required for identical replay after exit.
    copyWorld(rig.w, checkpoint);
    for (const expected of hashes) { tick(); expect(hashWorld(rig.w)).toBe(expected); }
  });

  it('keeps ordinary non-warp airborne impact speed, midpoint loss, and effect timing', () => {
    const rig = racingRig(flatPlane().track, { mode: 'item', slots: [{}, {}] });
    const kart = place(rig, 0, { s: 300, speed: 28 });
    place(rig, 1, { s: 200, u: 4, speed: 0 });
    const impactTick = rig.w.tick + 1, duration = 66;
    const effect = scheduleEffect(rig.w, rig.ctx, EF.airborne, 0, 1, impactTick, duration, 0, EFlag.BLOCKABLE, 902)!;
    const tick = () => rig.tick((_world, inputs) => { inputs[0]!.throttle = 15; });
    tick();
    expect(effect.param).toBe(28 * 4096);
    expect(ccImpactSpeed(rig.w, kart)).toBe(28);
    while (rig.w.tick < impactTick + 33) tick();
    // The original smoothstep speed curve is 0.625 of impact speed at its midpoint.
    expect(speedOf(kart)).toBeCloseTo(28 * 0.625, 3);
    while (rig.w.tick < impactTick + duration) tick();
    expect(kart.status.cc).toBe(0);
    expect(kart.stats.respawns).toBe(0);
    expect(rig.events.filter((event) => event.t === 'effect' && event.victim === 0 && event.effect === EF.airborne)).toMatchObject([{ tick: impactTick, result: 'hit' }]);
    expect(rig.events.filter((event) => event.t === 'effectEnd' && event.victim === 0 && event.effect === EF.airborne)).toMatchObject([{ tick: impactTick + duration - 1 }]);
  });
});
