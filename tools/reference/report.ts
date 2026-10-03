// Compact, reproducible evidence report. No fitting or simulation mutation.
// node tools/reference/report.ts --before before.json --after after.json --map-before maps-before.json --map-after maps-after.json --rejected rejected.json [--rejected-projection projection-trial.json] --independent-before baseline-node.json --browser-parity parity.json --review review.json --output docs/research/reference-driving-results.json
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { REFERENCE_CLIPS, REFERENCE_SOURCE, type ReferenceClip, type ReferenceKey } from '@cr/content/reference-driving.ts';

interface Sample { tick: number; speedKmh: number; boostTicks: number; startTicks: number; hash: number }
interface Event { t: string; tick: number; kind?: number }
interface MeasuredClip { id: string; sourceStartFrame: number; sourceEndFrame: number; inputTransitions: ReferenceClip['keys']; samples: Sample[]; events: Event[] }
interface Measurement { source: { sha256: string }; simVersion: number; profile: Record<string, number>; clips: MeasuredClip[] }
interface MatrixRow { key: string; id: string; trackHash: string; sha256: string; mode: string; field: string; finished: number; kartCount: number; completionRatio: number; hardHits: number; respawns: number; maxStuckTicks: number; itemsUsed: number; effectHits: number; combatEffectHits: number; incidents: { kind: string }[] }
interface Matrix { complete: boolean; itemCombat: boolean; sourceStable?: boolean; sourceTreeSha256?: string; sourceTreeSha256After?: string; sourceFingerprints: Record<string, string>; sourceFingerprintsAfter?: Record<string, string>; rows: MatrixRow[] }
interface Parity { variant: string; id: string; states: number; frames: number; allHashesEqual: boolean; everyFrameExactlyTwoTicks: boolean; allCameraStepsCorrect: boolean; camera: string }

const args = process.argv.slice(2), options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith('--') || !args[i + 1]) throw new Error('Expected --name value pairs; see report.ts usage');
  options.set(args[i]!, args[i + 1]!);
}
const inputs: Record<string, { file: string; sha256: string }> = {};
function read<T>(name: string): T {
  const path = options.get(name);
  if (!path) throw new Error(`Missing ${name}`);
  const bytes = readFileSync(path);
  inputs[name.slice(2)] = { file: basename(path), sha256: createHash('sha256').update(bytes).digest('hex') };
  return JSON.parse(bytes.toString()) as T;
}
const before = read<Measurement>('--before'), after = read<Measurement>('--after');
const independent = read<Measurement>('--independent-before'), parity = read<Parity[]>('--browser-parity');
const mapBefore = read<Matrix>('--map-before'), mapAfter = read<Matrix>('--map-after'), rejected = read<Matrix>('--rejected');
const rejectedProjection = options.has('--rejected-projection') ? read<Matrix>('--rejected-projection') : null;
const review = read<{ cases: { key: string; cause: string; reviewStatus: string }[]; remainingCaveat: string }>('--review');
const output = options.get('--output');
if (!output) throw new Error('Missing --output');
const r = (v: number): number => Math.round(v * 1e6) / 1e6;
const mean = (values: number[]): number | null => values.length ? r(values.reduce((a, b) => a + b, 0) / values.length) : null;
const direction = (keys: readonly ReferenceKey[]): number => Number(keys.includes('right')) - Number(keys.includes('left'));

function measured(report: Measurement, clip: ReferenceClip, requireInputMetadata = true): MeasuredClip {
  if (report.source.sha256 !== REFERENCE_SOURCE.sha256) throw new Error('Source video hash differs from annotations');
  const row = report.clips.find((c) => c.id === clip.id);
  const ticks = (clip.sourceEndFrame - clip.sourceStartFrame) * 2;
  if (!row) throw new Error(`Missing measured clip ${clip.id}`);
  if (requireInputMetadata && (row.sourceStartFrame !== clip.sourceStartFrame || row.sourceEndFrame !== clip.sourceEndFrame || JSON.stringify(row.inputTransitions) !== JSON.stringify(clip.keys))) throw new Error(`Input annotations changed for ${clip.id}`);
  if (row.samples.length !== ticks + 1 || row.samples.some((sample, i) => sample.tick !== i)) throw new Error(`Missing or shifted simulation samples for ${clip.id}`);
  return row;
}

function speedErrors(clip: ReferenceClip, row: MeasuredClip) {
  const observations = clip.observations.filter((o) => o.confidence === 'high');
  const nonzero = observations.filter((o) => o.speedKmh > 0);
  return {
    highConfidenceSamples: observations.length, nonzeroSamples: nonzero.length,
    nonzeroMapePercent: mean(nonzero.map((o) => 100 * Math.abs(row.samples[o.frame * 2]!.speedKmh - o.speedKmh) / o.speedKmh)),
    displayedNonzeroMapePercent: mean(nonzero.map((o) => 100 * Math.abs(Math.round(row.samples[o.frame * 2]!.speedKmh) - o.speedKmh) / o.speedKmh)),
    fittingErrorPercent: mean(observations.map((o) => 100 * Math.abs(row.samples[o.frame * 2]!.speedKmh - o.speedKmh) / Math.max(20, o.speedKmh))),
    meanAbsoluteKmhError: mean(observations.map((o) => Math.abs(row.samples[o.frame * 2]!.speedKmh - o.speedKmh))),
    minKmh: r(Math.min(...row.samples.map((s) => s.speedKmh))), maxKmh: r(Math.max(...row.samples.map((s) => s.speedKmh))), endKmh: r(row.samples.at(-1)!.speedKmh),
  };
}

function windowSpeed(points: { frame: number; speedKmh: number }[], entry: { frame: number; speedKmh: number } | undefined, endFrame: number) {
  if (!entry || !points.length) return null;
  const minimum = points.reduce((a, b) => b.speedKmh < a.speedKmh ? b : a);
  const peak = points.reduce((a, b) => b.speedKmh > a.speedKmh ? b : a);
  const afterPeak = points.filter((p) => p.frame >= peak.frame).reduce((a, b) => b.speedKmh < a.speedKmh ? b : a);
  const recovery = points.find((p) => p.frame >= minimum.frame && p.speedKmh >= entry.speedKmh);
  return {
    entryKmh: r(entry.speedKmh), entrySampleFrame: entry.frame, minKmh: r(minimum.speedKmh), minimumFrame: minimum.frame,
    lossPercent: entry.speedKmh > 0 ? r(100 * Math.max(0, entry.speedKmh - minimum.speedKmh) / entry.speedKmh) : null,
    peakKmh: r(peak.speedKmh), peakFrame: peak.frame, postPeakMinKmh: r(afterPeak.speedKmh),
    postPeakLossPercent: peak.speedKmh > 0 ? r(100 * (peak.speedKmh - afterPeak.speedKmh) / peak.speedKmh) : null,
    speedRecoveryAfterMinimumSeconds: recovery ? r((recovery.frame - minimum.frame) / 30) : null,
    recoveryRightCensored: !recovery, recoveryObservationEndsAtFrame: endFrame,
  };
}

function motions(clip: ReferenceClip, old: MeasuredClip, current: MeasuredClip) {
  const end = clip.sourceEndFrame - clip.sourceStartFrame;
  const presses = clip.keys.filter((entry, i) => entry.keys.includes('drift') && (i === 0 || !clip.keys[i - 1]!.keys.includes('drift')));
  return presses.map((press, i) => {
    const stop = presses[i + 1]?.frame ?? end;
    const observedPress = press.frame > 0 || clip.events.some((event) => event.kind === 'input-drift-press' && event.frame === 0);
    const signed = direction(press.keys);
    const counter = signed === 0 ? undefined : clip.keys.find((entry) => entry.frame > press.frame && entry.frame < stop && direction(entry.keys) === -signed);
    const sourcePoints = clip.observations.filter((o) => o.confidence === 'high' && o.frame >= press.frame && o.frame < stop);
    const entry = clip.observations.filter((o) => o.confidence === 'high' && o.frame <= press.frame).at(-1);
    const model = (row: MeasuredClip) => {
      const first = row.events.find((e) => (e.t === 'driftStart' || e.t === 'doubleDrift') && e.tick >= press.frame * 2 && e.tick < stop * 2);
      const endEvent = counter ? row.events.find((e) => (e.t === 'cut' || e.t === 'driftEnd') && e.tick >= counter.frame * 2 && e.tick < stop * 2) : undefined;
      const points = row.samples.filter((s) => s.tick >= press.frame * 2 && s.tick < stop * 2).map((s) => ({ frame: s.tick / 2, speedKmh: s.speedKmh }));
      return {
        responseEvent: first?.t ?? null, entryResponseSeconds: observedPress && first ? r(first.tick / 60 - press.frame / 30) : null,
        speed: windowSpeed(points, points[0], stop),
        counterRecoveryEvent: endEvent?.t ?? null,
        counterToDriftEndSeconds: counter && endEvent ? r(endEvent.tick / 60 - counter.frame / 30) : null,
        counterRecoveryRightCensored: counter ? !endEvent : null,
      };
    };
    return {
      pressFrame: press.frame, inputPressObserved: observedPress, endFrameExclusive: stop, direction: signed < 0 ? 'left' : signed > 0 ? 'right' : 'not-exclusive',
      counterFrame: counter?.frame ?? null, shiftHeldAtCounter: counter ? counter.keys.includes('drift') : null,
      source: { speed: windowSpeed(sourcePoints, entry && press.frame - entry.frame <= 3 ? entry : undefined, stop), physicalEntryResponseSeconds: null, physicalDriftRecoverySeconds: null, physicalDriftDurationSeconds: null },
      before: model(old), after: model(current),
    };
  });
}

function inventory(clip: ReferenceClip, old: MeasuredClip, current: MeasuredClip) {
  return ['gauge-full-visible', 'booster-consumed-visible'].map((kind) => {
    const observed = clip.events.filter((event) => event.kind === kind);
    const simulated = (row: MeasuredClip) => row.events.filter((e) => kind === 'gauge-full-visible' ? e.t === 'gaugeFull' : e.t === 'boostStart' && e.kind === 1);
    const previous = simulated(old), next = simulated(current);
    return { kind, observedCount: observed.length, simulatedCounts: { before: previous.length, after: next.length },
      events: observed.map((source, i) => ({ sourceFrame: source.frame, sourceSeconds: r(source.frame / 30), uncertaintySeconds: r(source.uncertaintyFrames / 30),
        beforeSeconds: previous[i] ? r(previous[i]!.tick / 60) : null, afterSeconds: next[i] ? r(next[i]!.tick / 60) : null,
        beforeErrorSeconds: previous[i] ? r(previous[i]!.tick / 60 - source.frame / 30) : null,
        afterErrorSeconds: next[i] ? r(next[i]!.tick / 60 - source.frame / 30) : null,
      })),
    };
  });
}

function boostIntervals(row: MeasuredClip) {
  return (['startTicks', 'boostTicks'] as const).flatMap((timer) => {
    const intervals: { timer: string; startSeconds: number; observedSeconds: number; leftCensored: boolean; rightCensored: boolean }[] = [];
    let start = -1;
    const add = (end: number, censored: boolean) => intervals.push({ timer, startSeconds: r(start / 60), observedSeconds: r((end - start) / 60), leftCensored: start === 0, rightCensored: censored });
    for (const sample of row.samples) {
      if (sample[timer] > 0 && start < 0) start = sample.tick;
      else if (sample[timer] <= 0 && start >= 0) { add(sample.tick, false); start = -1; }
    }
    if (start >= 0) add(row.samples.at(-1)!.tick, true);
    return intervals;
  });
}

function total(rows: MatrixRow[]) {
  return { races: rows.length, fullFields: rows.filter((r) => r.completionRatio === 1).length, finishedKarts: rows.reduce((n, r) => n + r.finished, 0), kartStarts: rows.reduce((n, r) => n + r.kartCount, 0),
    hardHits: rows.reduce((n, r) => n + r.hardHits, 0), respawns: rows.reduce((n, r) => n + r.respawns, 0), maxStuckTicks: Math.max(0, ...rows.map((r) => r.maxStuckTicks)),
    itemsUsed: rows.reduce((n, r) => n + r.itemsUsed, 0), effectHits: rows.reduce((n, r) => n + r.effectHits, 0), combatEffectHits: rows.reduce((n, r) => n + r.combatEffectHits, 0),
    uncreditedGateOrFinish: rows.reduce((n, r) => n + r.incidents.filter((i) => i.kind === 'uncreditedGate' || i.kind === 'uncreditedFinish').length, 0) };
}
function matrix(report: Matrix) {
  if (!report.complete || !report.itemCombat) throw new Error('Matrix is incomplete or does not enable real item combat');
  const bakedTracks: Record<string, { trackHash: string; sha256: string }> = {};
  for (const row of report.rows) {
    if (bakedTracks[row.id] && bakedTracks[row.id]!.sha256 !== row.sha256) throw new Error(`Mixed baked track versions for ${row.id}`);
    bakedTracks[row.id] = { trackHash: row.trackHash, sha256: row.sha256 };
  }
  return { total: total(report.rows), splits: ['speed', 'item'].flatMap((mode) => ['solo', 'pack'].map((field) => ({ mode, field, ...total(report.rows.filter((r) => r.mode === mode && r.field === field)) }))),
    bakedTracks,
    sourceStable: report.sourceStable ?? null, sourceTreeSha256: report.sourceTreeSha256 ?? null, sourceTreeSha256After: report.sourceTreeSha256After ?? null,
    sourceFingerprints: report.sourceFingerprints, sourceFingerprintsAfter: report.sourceFingerprintsAfter ?? null };
}

const clips = REFERENCE_CLIPS.map((clip) => {
  // The earlier independent snapshot report predates explicit frame/key metadata;
  // its video hash, tick grid, sample count, every speed, and every world hash are checked.
  const old = measured(before, clip), current = measured(after, clip), original = measured(independent, clip, false);
  const delta = Math.max(...old.samples.map((s, i) => Math.abs(s.speedKmh - original.samples[i]!.speedKmh)));
  const allHashesEqual = old.samples.every((s, i) => s.hash === original.samples[i]!.hash);
  if (delta !== 0 || !allHashesEqual) throw new Error(`Parameter reconstruction differs from independent baseline: ${clip.id}`);
  const oldSpeed = speedErrors(clip, old), newSpeed = speedErrors(clip, current);
  const gate = clip.split === 'validation' && clip.quantitativeEligible;
  return { id: clip.id, split: clip.split, skill: clip.skill, family: clip.family, sourceFrames: [clip.sourceStartFrame, clip.sourceEndFrame], quantitativeEligible: clip.quantitativeEligible,
    initialState: { speedKmh: clip.initialSpeedKmh, startTicks: clip.initialStartTicks ?? 0, boostTicks: clip.initialBoostTicks, storedBoosters: clip.initialBoosters ?? 0 },
    sourceObservedSpeedRangeKmh: [Math.min(...clip.observations.map((o) => o.speedKmh)), Math.max(...clip.observations.map((o) => o.speedKmh))],
    speed: { before: oldSpeed, after: newSpeed }, heldOutFivePercentGate: gate ? newSpeed.nonzeroMapePercent! <= 5 : null,
    independentBaseline: { states: old.samples.length, maxSpeedDeltaKmh: delta, allHashesEqual },
    inputMotions: motions(clip, old, current), inventoryTiming: inventory(clip, old, current),
    boostActivity: { sourceDurationSeconds: null, sourceDurationStatus: 'unidentifiable from the annotated evidence', before: boostIntervals(old), after: boostIntervals(current) },
  };
});
const previousRows = new Map(mapBefore.rows.map((row) => [row.key, row]));
const flags = mapAfter.rows.flatMap((row) => {
  const previous = previousRows.get(row.key);
  if (!previous) throw new Error(`Missing baseline scenario ${row.key}`);
  const reasons: string[] = [];
  if (row.completionRatio < previous.completionRatio) reasons.push('completion');
  if (row.respawns > previous.respawns) reasons.push('respawns');
  if (row.field === 'solo' && row.hardHits > previous.hardHits) reasons.push('solo-hard-contact');
  if (row.maxStuckTicks > Math.max(300, previous.maxStuckTicks + 120)) reasons.push('stall');
  if (!reasons.length) return [];
  const reviewed = review.cases.find((c) => c.key === row.key);
  return [{ key: row.key, reasons, beforeRespawns: previous.respawns, afterRespawns: row.respawns,
    reviewStatus: reviewed?.reviewStatus ?? 'unreviewed', cause: reviewed?.cause ?? null }];
});
const report = {
  formatVersion: 1, source: REFERENCE_SOURCE, inputs,
  definitions: {
    speedGate: 'Ordinary mean absolute percentage error over nonzero high-confidence HUD observations; measured at sourceFrame*2 simulation ticks. No temporal shift or denominator floor.',
    fittingError: 'Only the separate calibration score divides by max(20, source HUD km/h), including zero samples.',
    displayedError: 'Same nonzero percentage error after rounding simulated HUD speed to an integer.',
    motionWindow: 'Each rising raw Shift input through the next rising Shift input or clip end. Input windows are interventions, not measured physical drift episodes.',
    motionSpeed: 'Source entry is the most recent HUD sample at/before the press (at most 3 frames old); simulation entry is exact. Loss is max(0, entry-min)/entry. Post-peak loss separately records decline from the window peak to its subsequent minimum, including a launch that accelerates during drift. Speed recovery is first return to entry speed after the local minimum, not slip recovery.',
    responseTiming: 'Sim events are stamped at the completed 60 Hz tick. Source physical entry, slip recovery, and drift duration are null because only input and inventory events were annotated. Already-held Shift at clip start is not an observed press.',
    inventoryTiming: 'Ordinal same-kind matching without removing large errors. First awards/use in identified launches are controlled comparisons; continuation matching is diagnostic because initial gauge/history are unknown.',
    boostCensoring: 'Timer-active intervals seen in simulated samples. Activity in frame 0 is left-censored/seeded; activity at final sample is right-censored and its duration is only a lower bound. This never establishes original-engine booster duration.',
    referenceLimit: 'Only two held-out launches have identified initial motion. Their 90-tick start buff is a fixed model hypothesis. Beginner footage uses a different source kart. Variable key-overlay latency reaches 100 ms. No whole-video 5% fidelity claim.',
    matrixReview: 'Flags retain the original regression rules. Causal review distinguishes direct attack, following collisions/braking, and incomplete recovery. Reviewed does not mean every reset is unavoidable. Cases no longer flagged by the selected geometry are listed separately.',
    deferredAiContracts: 'The lane planner common-time projection and reported closing-speed contracts remain unchanged. Isolated corrections and a braking-threshold follow-up failed existing traffic gates and were rejected. They require joint planner calibration; this delivery does not claim those contracts were fixed.',
  },
  baselineIdentity: { measuredRuntimeSimVersion: before.simVersion, kind: 'current harness with original parameter overrides', referenceCommit: 'fb71b3f',
    originalProfile: Object.fromEntries(['aStartMax', 'startCapMul', 'g0', 'kCut'].map((key) => [key, before.profile[key]])),
    independentSnapshotSimVersion: independent.simVersion, independentSnapshotComparison: 'Every stored speed and world hash matches the independent fb71b3f simulation snapshot for all 12 clips. The older independent report omits explicit input/frame metadata; video hash, sample counts, and tick grids are independently checked.',
    browserComparison: 'Separate native browser captures used the independent baseline snapshot and final model. The supplied parity artifact certifies captured states, not unseen portions of the source video.',
  },
  adoptedProfile: Object.fromEntries(['aStartMax', 'startCapMul', 'g0', 'kCut'].map((key) => [key, after.profile[key]])),
  browserParity: parity.map(({ variant, id, states, frames, allHashesEqual, everyFrameExactlyTwoTicks, allCameraStepsCorrect, camera }) => ({ variant, id, states, frames, allHashesEqual, everyFrameExactlyTwoTicks, allCameraStepsCorrect, camera })),
  clips, actualCombatMatrix: { before: matrix(mapBefore), after: matrix(mapAfter), flags,
    resolvedReviewedCases: review.cases.filter((c) => !flags.some((f) => f.key === c.key)).map((c) => ({ key: c.key, originalCause: c.cause, currentRespawns: mapAfter.rows.find((row) => row.key === c.key)?.respawns ?? null })) },
  rejectedPostHitRecoveryExperiment: { adopted: false, reason: 'Single scoped recovery experiment was rejected: it repaired Belltower but increased global item-mode respawns 16→18 against its contemporaneous control. No further parameter tuning of that experiment was accepted.', driverSha256: rejected.sourceFingerprints['packages/sim/src/ai/driver.ts'], sourceStable: rejected.sourceStable ?? null, total: total(rejected.rows) },
  rejectedCommonTimeProjectionExperiment: rejectedProjection ? { adopted: false,
    reason: 'The common-time gap correction was rejected after full-matrix navigation regressions and an existing traffic-test failure. The delivered policy must not be described as fixing that projection calculation; joint planner calibration is deferred.',
    sourceFingerprints: rejectedProjection.sourceFingerprints, sourceStable: rejectedProjection.sourceStable ?? null, total: total(rejectedProjection.rows) } : null,
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, clips: clips.length, motionWindows: clips.reduce((n, c) => n + c.inputMotions.length, 0), heldOut: clips.filter((c) => c.heldOutFivePercentGate !== null).map((c) => ({ id: c.id, errorPercent: c.speed.after.nonzeroMapePercent, pass: c.heldOutFivePercentGate })), matrix: report.actualCombatMatrix.after.total }));
