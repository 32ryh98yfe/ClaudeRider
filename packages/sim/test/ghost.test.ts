// Time Attack ghosts (50-test-plan: "record → replay reproduces hashWorld"): a recorded run encodes to bytes,
// decodes to the same ghost, and replaying its inputs in a fresh world ends on the recorded hashWorld.
import { describe, expect, it } from 'vitest';
import {
  createWorld, makeContext, step, makeInput, hashWorld, ArraySink, AI_TIERS, createAiDriver, Edge, SIM_VERSION,
  type BakedTrack, type RaceConfig, type InputFrame, type WorldState,
} from '@cr/sim';
import { GhostPlayer, GhostRecorder, decodeGhost, encodeGhost, ghostConfig, type Ghost } from '../src/race/ghost.ts';
import { bakedTrack, getContent } from './rig.ts';

function world(track: BakedTrack, cfg: RaceConfig): { w: WorldState; tick: (inp: InputFrame) => void } {
  const content = getContent();
  const w = createWorld(cfg, track, content);
  const ctx = makeContext({ track, cfg, content, role: 'authority', events: new ArraySink() });
  const inputs = [makeInput()];
  return { w, tick: (inp) => { Object.assign(inputs[0]!, inp); step(w, inputs, ctx); } };
}

function record(track: BakedTrack): Ghost {
  const cfg: RaceConfig = {
    simVersion: SIM_VERSION, mode: 'timeAttack', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: 1,
    slots: [{ kind: 'human', team: 0, name: '클로드', characterId: 'clay', kartBodyId: 'arrowhead', vMul: 1 }], seed: 77,
    rules: { retireTicks: 600, friendlyFire: 'off', itemSet: 'standard', rubberBand: false, instantBoostInItem: true },
    introTicks: 0, countdownTicks: 180,
  };
  const r = world(track, cfg);
  const driver = createAiDriver(track, getContent(), 0, AI_TIERS.pro, {}, 5);
  const rec = new GhostRecorder(), inp = makeInput();
  const k = r.w.karts[0]!;
  for (let t = 0; t < 60 * 90 && k.race.finishTick < 0; t++) {
    inp.edges = 0;
    driver.decide(r.w, inp);
    rec.push(inp);
    r.tick(inp);
  }
  expect(k.race.finishTick).toBeGreaterThan(0);
  return rec.finish(cfg, { raceTicks: k.race.lastLapTicks, bestLapTicks: k.race.bestLapTicks, lapTicks: [k.race.lastLapTicks], finalHash: hashWorld(r.w) });
}

function replay(track: BakedTrack, g: Ghost, tamper = -1): { hash: number; finishTick: number } {
  const r = world(track, ghostConfig(g));
  const p = new GhostPlayer(g), inp = makeInput();
  for (let t = 0; t < g.ticks; t++) {
    expect(p.next(inp)).toBe(true);
    if (t === tamper) inp.steer = inp.steer > 0 ? -127 : 127;
    r.tick(inp);
  }
  expect(p.next(inp)).toBe(false);
  return { hash: hashWorld(r.w), finishTick: r.w.karts[0]!.race.finishTick };
}

describe('Time Attack ghost (race/ghost.ts)', () => {
  const track = bakedTrack('spark_circuit/proving_ring');
  const g = record(track);

  it('run-length encoding is compact and the codec round-trips exactly', () => {
    expect(g.runs.length / 2).toBeLessThan(g.ticks); // the countdown and steady stretches collapse into runs
    const bytes = encodeGhost(g);
    expect(bytes.byteLength).toBeLessThan(200 + 8 * g.runs.length);
    expect(decodeGhost(bytes)).toEqual(g);
    expect(() => decodeGhost(bytes.subarray(0, bytes.byteLength - 3))).toThrow();
  });

  it('replaying the decoded ghost in a fresh world reproduces the final hashWorld and the finish tick', () => {
    const d = decodeGhost(encodeGhost(g));
    const r = replay(track, d);
    expect(r.hash).toBe(g.finalHash);
    expect(r.finishTick).toBeGreaterThan(0);
  });

  it('a single changed input changes the replay hash (the check has teeth)', () => {
    expect(replay(track, g, 400).hash).not.toBe(g.finalHash);
  });

  it('records and decodes drift pulses without aliasing target slots or emotes', () => {
    const recorder = new GhostRecorder();
    const frames = [
      { ...makeInput(), steer: 127, edges: Edge.DRIFT, aim: 255, emote: 15 },
      { ...makeInput(), steer: -127, edges: Edge.DRIFT | Edge.TAP_L, aim: 7, emote: 1 },
      { ...makeInput(), held: 1, edges: 127, aim: 0, emote: 0 },
      makeInput(),
    ];
    for (const frame of frames) recorder.push(frame);
    const pulseGhost = recorder.finish(ghostConfig(g), { raceTicks: 4, bestLapTicks: 4, lapTicks: [4], finalHash: 0 });
    const decoded = decodeGhost(encodeGhost(pulseGhost));
    expect(decoded.simVersion).toBe(SIM_VERSION);
    const player = new GhostPlayer(decoded), out = makeInput();
    for (const frame of frames) { expect(player.next(out)).toBe(true); expect(out).toEqual(frame); }
    expect(player.next(out)).toBe(false);
    expect(out).toEqual(makeInput());
  });
});
