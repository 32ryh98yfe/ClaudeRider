// Minimal headless race rig for trackc tests: one kart on a baked track, teleport helpers, tick loop.
import { loadContent, type ContentTables } from '@cr/content';
import { ArraySink, createWorld, makeContext, makeInput, step, Phase, copyLoc, type BakedTrack, type InputFrame, type RaceConfig, type SimEvent, type StepContext, type WorldState, type FrameSample } from '@cr/sim';

let content: ContentTables | null = null;
export function getContent(): ContentTables { return (content ??= loadContent()); }

export interface SimRig { w: WorldState; ctx: StepContext; inp: InputFrame; events: SimEvent[]; tick(n?: number, drive?: (w: WorldState, inp: InputFrame) => void): void }

export function simRig(track: BakedTrack, laps = 3): SimRig {
  const c = getContent();
  const cfg: RaceConfig = {
    simVersion: 1, mode: 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps,
    slots: [{ kind: 'human', team: 0, name: 'k0', characterId: 'clay', kartBodyId: 'pebble', vMul: 1 }],
    seed: 1, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180,
  };
  const w = createWorld(cfg, track, c);
  const sink = new ArraySink();
  const ctx = makeContext({ track, cfg, content: c, role: 'authority', events: sink });
  const inp = makeInput();
  const events: SimEvent[] = [];
  const rig: SimRig = {
    w, ctx, inp, events,
    tick(n = 1, drive) {
      for (let i = 0; i < n; i++) { drive?.(w, inp); step(w, [inp], ctx); sink.drain(events); inp.edges = 0; inp.driftRequests = 0; }
    },
  };
  // run the countdown so the race is live
  while (w.phase < Phase.RACING) rig.tick();
  return rig;
}

/** Places kart 0 on path p at s (lateral d) moving at v along direction f = tangent·cos a + right·sin a. */
export function place(rig: SimRig, p: number, s: number, d: number, v: number, aDeg = 0): void {
  const T = rig.ctx.track, k = rig.w.karts[0]!, b = k.body;
  const f: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  T.frameAt(p, s, f);
  const a = (aDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  b.px = f.px + f.rx * d + f.ux * 0.02; b.py = f.py + f.ry * d + f.uy * 0.02; b.pz = f.pz + f.rz * d + f.uz * 0.02;
  b.fx = f.tx * ca + f.rx * sa; b.fy = f.ty * ca + f.ry * sa; b.fz = f.tz * ca + f.rz * sa;
  b.vx = b.fx * v; b.vy = b.fy * v; b.vz = b.fz * v;
  b.nx = f.ux; b.ny = f.uy; b.nz = f.uz; b.grounded = 1; b.airTicks = 0; b.yawRate = 0; b.wallContact = 0;
  T.locateGlobal(b.px, b.py, b.pz, k.race.loc);
  copyLoc(k.race.lastValid, k.race.loc);
  k.race.noGroundTicks = 0; k.race.offGraphTicks = 0; k.race.wrongWayTicks = 0;
}
