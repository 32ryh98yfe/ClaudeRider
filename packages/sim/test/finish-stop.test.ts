import { describe, expect, it } from 'vitest';
import { Boost, Edge, Held, Phase, copyWorld, cloneWorld, hashWorld } from '@cr/sim';
import { FINISH_BRAKE_TICKS } from '../src/race/finish.ts';
import { startRespawn } from '../src/race/respawn.ts';
import { corridor, flatPlane, helixKit } from './fixtures/kits.ts';
import { racingRig, place, speedOf } from './util.ts';

function heldControls(rig: ReturnType<typeof racingRig>): void {
  for (const input of rig.inputs) Object.assign(input, { throttle: 15, steer: 127, held: Held.DRIFT | Held.ITEM, edges: Edge.USE_ITEM | Edge.RESPAWN });
}

describe('authoritative finish braking and parking', () => {
  it('brakes over 48 ticks, ignores held controls, and stays parked for 600 more ticks', () => {
    const r = racingRig(corridor().track), k = place(r, 0, { s: 200, speed: 28.9 });
    k.race.finishTick = r.w.tick; k.race.finishFrac = 0.25;
    k.drive.gauge = 0.75; k.drive.boosters = 2; k.drive.boostTicks = 90; k.drive.boostKind = Boost.NORMAL;
    const start = k.body.px;
    r.run(FINISH_BRAKE_TICKS, () => heldControls(r));
    expect(k.body.px - start).toBeGreaterThan(8); expect(k.body.px - start).toBeLessThan(12);
    expect(speedOf(k)).toBe(0); expect(k.body.yawRate).toBe(0);
    expect(k.drive.boostTicks).toBe(0); expect(k.drive.drift).toBe(0);
    expect(k.drive.gauge).toBe(0.75); expect(k.drive.boosters).toBe(2);
    const body = { ...k.body }, finishTick = k.race.finishTick;
    r.run(600, () => heldControls(r));
    expect(k.body).toEqual(body); expect(k.race.finishTick).toBe(finishTick); expect(k.stats.respawns).toBe(0);
  });

  it('lets airborne finishers land and parks on a slope without gravity restarting them', () => {
    for (const [track, airborne] of [[flatPlane().track, true], [helixKit().track, false]] as const) {
      const r = racingRig(track), k = place(r, 0, { s: 150, h: airborne ? 3 : 0, speed: 20 });
      if (airborne) { k.body.grounded = 0; k.body.coyote = 0; k.body.vy = 4; }
      k.race.finishTick = r.w.tick;
      r.run(120, () => heldControls(r));
      expect(k.body.grounded).toBe(1); expect(speedOf(k)).toBe(0);
      const at = { ...k.body };
      r.run(600, () => heldControls(r));
      expect(k.body).toEqual(at); expect(k.stats.respawns).toBe(0);
    }
  });

  it('does not stop other racers, collect items or use a finished kart as a collision obstacle', () => {
    const r = racingRig(corridor().track, { mode: 'item', slots: [{}, {}] });
    const done = place(r, 0, { s: 220, speed: 0 }), other = place(r, 1, { s: 200, speed: 25 });
    done.race.finishTick = r.w.tick; done.items.slot0 = 1; const x = done.body.px;
    r.run(120, (_w, input) => {
      input[0]!.throttle = 15; input[0]!.edges = Edge.USE_ITEM;
      input[1]!.throttle = 15;
    });
    expect(done.body.px).toBe(x); expect(other.body.px).toBeGreaterThan(x + 20);
    expect(done.stats.itemsUsed).toBe(0); expect(r.w.phase).toBe(Phase.RACING);
    expect(r.events.some((e) => e.t === 'bump')).toBe(false);
  });

  it('parks a finisher that falls into a void without changing its result or restarting its driving', () => {
    const r = racingRig(corridor().track), k = place(r, 0, { s: 200, speed: 20 });
    k.race.finishTick = r.w.tick; k.race.finishFrac = 0.375;
    k.body.pz = 100; k.body.py = 4; k.body.vy = -20; k.body.grounded = 0; k.body.coyote = 0;
    const result = [k.race.finishTick, k.race.finishFrac];
    r.run(120, () => heldControls(r));
    expect(k.body.grounded).toBe(1); expect(Math.abs(k.body.pz)).toBeLessThan(8);
    expect(speedOf(k)).toBe(0); expect(k.stats.respawns).toBe(0);
    expect([k.race.finishTick, k.race.finishFrac]).toEqual(result);
    const body = { ...k.body }; r.run(600, () => heldControls(r)); expect(k.body).toEqual(body);
  });

  it('retires and stops every remaining kart when the world is done, including after restoring a snapshot', () => {
    const r = racingRig(flatPlane().track), k = place(r, 0, { s: 200, speed: 20 });
    r.w.phase = Phase.DONE; r.w.endTick = r.w.tick; k.race.retired = 1;
    r.run(17, () => heldControls(r)); const snapshot = cloneWorld(r.w);
    r.run(50, () => heldControls(r)); const expected = hashWorld(r.w);
    copyWorld(r.w, snapshot); r.run(50, () => heldControls(r));
    expect(hashWorld(r.w)).toBe(expected); expect(speedOf(k)).toBe(0);
  });

  for (const phase of [1, 2] as const) it(`parks retirement during respawn phase ${phase} without a suspended body or an extra respawn`, () => {
    const r = racingRig(flatPlane().track), k = place(r, 0, { s: 200, speed: 20 });
    k.body.py = 3; k.body.grounded = 0; k.body.coyote = 0;
    startRespawn(r.w, k, r.ctx); k.race.respawnPhase = phase;
    const count = k.stats.respawns;
    r.w.phase = Phase.DONE; r.w.endTick = r.w.tick;
    r.run(120, () => heldControls(r));
    expect(k.race.retired).toBe(1); expect(k.race.respawnPhase).toBe(0);
    expect(k.body.grounded).toBe(1); expect(k.body.py).toBeLessThan(0.1);
    expect(speedOf(k)).toBe(0); expect(k.stats.respawns).toBe(count);
    const body = { ...k.body }; r.run(600, () => heldControls(r)); expect(k.body).toEqual(body);
  });
});
