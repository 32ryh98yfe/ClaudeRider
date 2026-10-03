import { describe, expect, it } from 'vitest';
import { Edge, Held, createWorld, hashWorld, KMH_PER_MPS, makeInput, StartTier, type RaceConfig } from '@cr/sim';
import { loadContent as contentTables } from '@cr/content';
import type { ReferenceClip } from '@cr/content/reference-driving.ts';
import { NetClient, loopbackPair } from '@cr/net';
import { flatPlane } from '../../../packages/sim/test/fixtures/kits.ts';
import { SIM_VERSION } from '@cr/sim';
import { LocalAuthority } from '../src/net/localAuthority.ts';
import { ReferenceReplay, initializeReferenceWorld } from '../src/dev/reference/replay.ts';

const clip: ReferenceClip = {
  id: 'test', split: 'validation', skill: 'expert', family: 'drift', sourceStartFrame: 120, sourceEndFrame: 240,
  initialSpeedKmh: 180, initialBoostTicks: 0, quantitativeEligible: false,
  keys: [{ frame: 0, keys: ['up', 'right'] }, { frame: 5, keys: ['up', 'right', 'drift'] }, { frame: 7, keys: ['up', 'left', 'boost'] }, { frame: 12, keys: ['up'] }],
  observations: [], events: [], notes: [],
};

const config: RaceConfig = {
  simVersion: SIM_VERSION, mode: 'speed', teams: 'solo', trackId: 'proving_ring', trackHash: 'test', laps: 9, seed: 0,
  slots: [{ kind: 'human', team: 0, name: 'test', characterId: 'clay', kartBodyId: 'pebble', vMul: 1 }],
  rules: { retireTicks: 3600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 0,
};

describe('tick-addressed reference replay', () => {
  it('filters keys with the calibrated keyboard response, creates edges once, and survives repeated/backwards lookups', () => {
    const replay = new ReferenceReplay(clip);
    expect(replay.frameAt(0)).toMatchObject({ steer: 76, throttle: 15, edges: Edge.TAP_R });
    expect(replay.frameAt(1)).toMatchObject({ steer: 107, edges: 0 });
    expect(replay.frameAt(10).held & Held.DRIFT).toBe(Held.DRIFT);
    expect(replay.frameAt(14).edges).toBe(Edge.TAP_L | Edge.USE_ITEM);
    const before = replay.frameAt(15);
    replay.frameAt(80); replay.frameAt(1);
    expect(replay.frameAt(15)).toEqual(before);
    expect(replay.frameAt(replay.durationTicks)).toEqual(makeInput());
  });

  it('seeds once and refuses an in-progress state', () => {
    const world = createWorld(config, flatPlane().track, contentTables());
    initializeReferenceWorld(world, clip);
    const kart = world.karts[0]!;
    expect(Math.hypot(kart.body.vx, kart.body.vy, kart.body.vz) * KMH_PER_MPS).toBeCloseTo(180, 2);
    expect(kart.stats.startTier).toBe(StartTier.NONE);
    expect(kart.drive.startTicks).toBe(0);
    world.tick = 1;
    expect(() => initializeReferenceWorld(world, clip)).toThrow('tick zero');
  });

  it('publishes the seeded state through a keyframe and keeps authority/prediction identical at 30 and 60 Hz', () => {
    const hashes: number[] = [];
    for (const ticksPerFrame of [1, 2]) {
      const track = flatPlane().track, content = contentTables(), replay = new ReferenceReplay(clip);
      const [client, server] = loopbackPair(0);
      const recorded: number[] = [];
      const authority = new LocalAuthority({ config, track, content, slot: 0, transport: server,
        initialize: (world) => initializeReferenceWorld(world, clip), onTick: (world) => recorded.push(world.tick),
      });
      let now = 0;
      const net = new NetClient({ transport: client, cfg: config, track, content, slot: 0, mode: 'free', maxSteps: ticksPerFrame,
        nowMs: () => now, inputProvider: (world, out) => { replay.frameAt(world.tick, out); },
      });
      authority.publishInitialSnapshot(); net.update(0);
      expect(hashWorld(net.world)).toBe(hashWorld(authority.room.world));
      for (let frame = 1; frame <= replay.durationTicks / ticksPerFrame; frame++) {
        now = frame * ticksPerFrame * 1000 / 60 + 0.000001;
        expect(net.update(now)).toBe(ticksPerFrame);
        net.update(now);
        expect(net.world.tick).toBe(frame * ticksPerFrame);
        expect(hashWorld(net.world)).toBe(hashWorld(authority.room.world));
      }
      expect(recorded).toHaveLength(replay.durationTicks);
      hashes.push(hashWorld(net.world)); net.close();
    }
    expect(hashes[0]).toBe(hashes[1]);
  });
});
