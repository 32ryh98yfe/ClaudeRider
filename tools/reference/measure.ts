// Replays annotated raw keys through the real input filter and deterministic step(), on fixed flat ground.
// node tools/reference/measure.ts /tmp/reference.json [--overrides '{"aStartMax":50}']
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadContent } from '@cr/content';
import { REFERENCE_CLIPS, REFERENCE_SOURCE, type ReferenceClip } from '@cr/content/reference-driving.ts';
import {
  ArraySink, KMH_PER_MPS, SIM_VERSION, createWorld, hashWorld, loadCtrk, makeContext, makeInput, paramsFor, step, toArrayBuffer,
  type KartParams, type KartState, type RaceConfig, type SimEvent,
} from '@cr/sim';
import { ReferenceReplay, initializeReferenceWorld } from '../../apps/client/src/dev/reference/replay.ts';

export interface ReferenceSample {
  tick: number; frame: number; seconds: number; speedKmh: number; forwardMps: number; lateralMps: number;
  heading: number; slip: number; yawRate: number; drift: number; boostTicks: number; startTicks: number;
  gauge: number; x: number; z: number; hash: number;
}
const content = loadContent();
const track = loadCtrk(toArrayBuffer(readFileSync(new URL('../../apps/client/public/reference/reference_pad.ctrk', import.meta.url))));
const params = paramsFor(content.karts.get('pebble'));
const original = { ...params };

function sample(k: KartState, tick: number, hash: number): ReferenceSample {
  const b = k.body;
  const u = b.vx * b.fx + b.vy * b.fy + b.vz * b.fz;
  const lateral = b.vx * (b.ny * b.fz - b.nz * b.fy) + b.vy * (b.nz * b.fx - b.nx * b.fz) + b.vz * (b.nx * b.fy - b.ny * b.fx);
  return {
    tick, frame: tick / 2, seconds: tick / 60, speedKmh: Math.hypot(b.vx, b.vy, b.vz) * KMH_PER_MPS,
    forwardMps: u, lateralMps: lateral, heading: Math.atan2(-b.fz, b.fx), slip: Math.atan2(-lateral, u),
    yawRate: b.yawRate, drift: k.drive.drift, boostTicks: k.drive.boostTicks, startTicks: k.drive.startTicks,
    gauge: k.drive.gauge, x: b.px, z: b.pz, hash,
  };
}

export function measureClip(clip: ReferenceClip, overrides: Partial<KartParams> = {}, detail = true) {
  Object.assign(params, original, overrides);
  // Derived targets follow the candidate kart; the display scale is a fixed source-independent unit convention.
  params.vInst = 1.05 * params.vGrip; params.vDraft = 1.05 * params.vGrip; params.vTeam = params.vBoost;
  const cfg: RaceConfig = {
    simVersion: SIM_VERSION, mode: 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: 1,
    slots: [{ kind: 'human', name: 'reference', team: 0, characterId: 'clay', kartBodyId: 'pebble', vMul: 1 }], seed: 4242,
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 0,
  };
  const world = createWorld(cfg, track, content), sink = new ArraySink();
  initializeReferenceWorld(world, clip);
  const ctx = makeContext({ track, content, cfg, events: sink, role: 'authority' });
  const replay = new ReferenceReplay(clip), input = makeInput(), inputs = [input];
  const samples: ReferenceSample[] = [sample(world.karts[0]!, 0, detail ? hashWorld(world) : 0)];
  const events: SimEvent[] = [];
  for (let tick = 0; tick < replay.durationTicks; tick++) {
    replay.frameAt(tick, input); step(world, inputs, ctx); sink.drain(events);
    samples.push(sample(world.karts[0]!, tick + 1, detail ? hashWorld(world) : 0));
  }
  const comparisons = clip.observations.filter((o) => o.confidence === 'high').map((o) => {
    const sim = samples[o.frame * 2]!;
    return { frame: o.frame, source: o.speedKmh, simulated: sim.speedKmh, absoluteError: Math.abs(sim.speedKmh - o.speedKmh), relativeError: Math.abs(sim.speedKmh - o.speedKmh) / Math.max(20, o.speedKmh) };
  });
  const meanRelativeError = comparisons.reduce((sum, row) => sum + row.relativeError, 0) / Math.max(1, comparisons.length);
  const nonzero = comparisons.filter((row) => row.source > 0);
  const meanNonzeroRelativeError = nonzero.reduce((sum, row) => sum + row.absoluteError / row.source, 0) / Math.max(1, nonzero.length);
  const meanDisplayedRelativeError = nonzero.reduce((sum, row) => sum + Math.abs(Math.round(row.simulated) - row.source) / row.source, 0) / Math.max(1, nonzero.length);
  const meanAbsoluteKmhError = comparisons.reduce((sum, row) => sum + row.absoluteError, 0) / Math.max(1, comparisons.length);
  const speedSeries = samples.map((s) => s.speedKmh);
  const summary = {
    id: clip.id, split: clip.split, family: clip.family, quantitativeEligible: clip.quantitativeEligible,
    sourceStartFrame: clip.sourceStartFrame, sourceEndFrame: clip.sourceEndFrame, inputTransitions: clip.keys,
    initialSpeedKmh: clip.initialSpeedKmh, minSpeedKmh: Math.min(...speedSeries), maxSpeedKmh: Math.max(...speedSeries),
    endSpeedKmh: samples.at(-1)!.speedKmh, meanRelativeError, meanNonzeroRelativeError, meanDisplayedRelativeError, meanAbsoluteKmhError, comparedSamples: comparisons.length,
    driftStarts: events.filter((e) => e.t === 'driftStart').map((e) => e.tick),
    driftEnds: events.filter((e) => e.t === 'driftEnd').map((e) => e.tick),
    boostStarts: events.filter((e) => e.t === 'boostStart').map((e) => e.tick),
    cuts: events.filter((e) => e.t === 'cut').map((e) => e.tick),
    respawns: world.karts[0]!.stats.respawns,
  };
  Object.assign(params, original);
  return { ...summary, comparisons, ...(detail ? { samples, events } : {}) };
}

export function measureReferences(overrides: Partial<KartParams> = {}, detail = true) {
  const clips = REFERENCE_CLIPS.map((clip) => measureClip(clip, overrides, detail));
  const aggregate = (split: ReferenceClip['split']) => {
    const eligible = clips.filter((c) => c.split === split && c.quantitativeEligible);
    return { clips: eligible.length, meanNonzeroRelativeError: eligible.length ? eligible.reduce((sum, c) => sum + c.meanNonzeroRelativeError, 0) / eligible.length : null, fittingError: eligible.length ? eligible.reduce((sum, c) => sum + c.meanRelativeError, 0) / eligible.length : null };
  };
  return { source: REFERENCE_SOURCE, simVersion: SIM_VERSION, profile: { ...original, ...overrides }, metric: 'meanNonzeroRelativeError is standard mean absolute relative HUD-speed error excluding source zero. meanRelativeError uses a 20 km/h denominator floor only for stable fitting near rest. No per-clip time warp.', calibration: aggregate('calibration'), validation: aggregate('validation'), clips };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node tools/reference/measure.ts <output.json> [--overrides <JSON or JSON file>]');
  const at = process.argv.indexOf('--overrides');
  const arg = at >= 0 ? process.argv[at + 1] : undefined;
  const overrides: Partial<KartParams> = arg ? JSON.parse(arg.startsWith('{') ? arg : readFileSync(arg, 'utf8')) : {};
  const report = measureReferences(overrides);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  for (const clip of report.clips) console.log(`${clip.split.padEnd(11)} ${clip.id.padEnd(27)} MARE ${(clip.meanNonzeroRelativeError * 100).toFixed(2)}% / fit ${(clip.meanRelativeError * 100).toFixed(2)}% ${clip.quantitativeEligible ? 'eligible' : 'diagnostic only'}`);
}
