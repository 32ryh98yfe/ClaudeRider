// V10 clearance follows the live kart over the actual road and through declared flight/attachment transitions.
// A world-space tangent ray runs under rising roads and cannot represent a kart on that road.
import { loadContent } from '@cr/content';
import {
  ArraySink, Boost, Gear, Phase, SIM_VERSION, StartTier, V_BOOST, createWorld, makeContext, makeInput, step,
  type BakedTrack, type RaceConfig,
} from '@cr/sim';
import type { Sample } from './geometry.ts';

export interface BoostClearanceResult { blocked: boolean; tick: number; distance: number; reason: 'clear' | 'wall' | 'recovery'; contact?: { x: number; y: number; z: number; s: number; grounded: number } }

export function probeBoostClearance(track: BakedTrack, q: Sample, lateral: number): BoostClearanceResult {
  // Moving hazards have their own timing/clearance rules. This view keeps every static collider and all road,
  // gravity, pad, rail and warp data, without mutating the baked track shared by the compiler or other probes.
  const staticTrack = Object.create(track) as BakedTrack;
  Object.defineProperty(staticTrack, 'hazards', { value: [] });
  const content = loadContent();
  const cfg: RaceConfig = {
    simVersion: SIM_VERSION, mode: 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: 99,
    slots: [{ kind: 'human', team: 0, name: 'V10', characterId: 'clay', kartBodyId: 'pebble', vMul: 1 }], seed: 1,
    rules: { retireTicks: 600, friendlyFire: 'off', itemSet: 'standard', rubberBand: false, instantBoostInItem: false },
    introTicks: 0, countdownTicks: 0,
  };
  const world = createWorld(cfg, staticTrack, content), k = world.karts[0]!, b = k.body;
  world.phase = Phase.RACING; k.stats.startTier = StartTier.NONE;
  b.px = q.x + q.rx * lateral; b.py = q.y + q.ry * lateral; b.pz = q.z + q.rz * lateral;
  b.fx = q.tx; b.fy = q.ty; b.fz = q.tz; b.nx = q.ux; b.ny = q.uy; b.nz = q.uz;
  b.vx = q.tx * V_BOOST; b.vy = q.ty * V_BOOST; b.vz = q.tz * V_BOOST;
  b.grounded = 1; b.coyote = 7; b.airTicks = 0; b.yawRate = 0;
  k.drive.gear = Gear.D; k.drive.prevThrottle = 1;
  k.drive.boostTicks = 121; k.drive.boostKind = Boost.NORMAL;
  staticTrack.locateGlobal(b.px, b.py, b.pz, k.race.loc);
  Object.assign(k.race.lastValid, k.race.loc); k.race.raceDist = k.race.loc.sMain; k.race.lap = 0;
  const sink = new ArraySink(), ctx = makeContext({ track: staticTrack, cfg, content, role: 'authority', events: sink });
  const input = makeInput(); input.throttle = 15;
  let distance = 0;
  for (let tick = 1; tick <= 120; tick++) {
    const x = b.px, y = b.py, z = b.pz;
    step(world, [input], ctx);
    distance += Math.hypot(b.px - x, b.py - y, b.pz - z);
    if (sink.list.some((e) => e.t === 'wall')) return { blocked: true, tick, distance, reason: 'wall', contact: { x: b.px, y: b.py, z: b.pz, s: k.race.loc.sMain, grounded: b.grounded } };
    if (k.race.respawnPhase !== 0) return { blocked: true, tick, distance, reason: 'recovery' };
    sink.list.length = 0;
  }
  return { blocked: false, tick: 120, distance, reason: 'clear' };
}
