// Repeatable physical measurements for the v10 handling requirements. No rendering, AI steering or pose correction.
// Run: node tools/reference/measure-handling.ts [output.json]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Boost, Edge, Held, SIM_VERSION, appendDriftRequest, paramsFor, KMH_PER_MPS, type InputFrame } from '../../packages/sim/src/index.ts';
import { getContent } from '../../packages/sim/test/rig.ts';
import { flatPlane, cornerKit } from '../../packages/sim/test/fixtures/kits.ts';
import { racingRig, place, speedOf } from '../../packages/sim/test/util.ts';
import { InputActionFilter, type DriveActions } from '../../apps/client/src/input/actionFilter.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const P = paramsFor(getContent().karts.get('pebble'));
const scheduleFile = 'docs/research/handling-keyboard-scenarios.json';
const schedules = JSON.parse(readFileSync(resolve(root, scheduleFile), 'utf8')) as {
  scenarios: { radiusM: number; initialU: number; entryTick: number; turnTicks: number; counterTicks: number }[];
  strongerTractionComparison: unknown;
};
const sourceFiles = [
  'tools/reference/measure-handling.ts', scheduleFile,
  'packages/sim/src/kart/motion.ts', 'packages/sim/src/step.ts', 'packages/sim/src/track/BakedTrack.ts',
  'packages/sim/test/fixtures/builder.ts', 'packages/sim/test/fixtures/kits.ts',
  'packages/sim/src/kart/handling.ts', 'packages/sim/src/kart/dynamics.ts', 'packages/sim/src/kart/params.ts',
  'packages/sim/src/core/state.ts', 'packages/sim/src/core/units.ts', 'apps/client/src/input/actionFilter.ts',
  ...readdirSync(resolve(root, 'packages/content/src/karts')).filter((s) => s.endsWith('.ts')).map((s) => `packages/content/src/karts/${s}`),
].sort();
const hash = createHash('sha256');
for (const f of sourceFiles) { hash.update(f); hash.update(readFileSync(resolve(root, f))); }
const sourceHash = hash.digest('hex');
const round = (n: number): number => Number(n.toFixed(6));
const angle = (y: number, x: number): number => Math.atan2(y, x);
const wrap = (a: number): number => a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a;

function rig() { const r = racingRig(flatPlane().track); const k = place(r, 0, { s: 300, speed: P.vGrip }); return { r, k }; }
function input(f: InputFrame, steer: number, held: boolean, press = false): void {
  Object.assign(f, { steer: Math.round(-steer * 127), steerIntent: Math.sign(-steer), throttle: 15, brake: 0,
    held: held ? Held.DRIFT : 0, edges: press ? Edge.DRIFT : 0, driftRequests: press ? appendDriftRequest(0, -steer) : 0 });
}
function lateral(k: ReturnType<typeof rig>['k']): number { const b = k.body; return b.vx * b.fz - b.vz * b.fx; }
function slip(k: ReturnType<typeof rig>['k']): number { const b = k.body; return Math.abs(angle(lateral(k), b.vx * b.fx + b.vz * b.fz)) * 180 / Math.PI; }

const counter = [];
for (const dir of [-1, 1]) for (const boost of [false, true]) for (const held of [false, true]) {
  const { r, k } = rig(); if (boost) { k.drive.boostTicks = 300; k.drive.boostKind = Boost.NORMAL; }
  r.run(45, (_w, f) => input(f[0]!, dir, true));
  const initialSlipDeg = slip(k), initialYaw = k.body.yawRate;
  let reverse = -1, restored = -1, aligned = -1, minSpeed = speedOf(k);
  for (let t = 1; t <= 60; t++) {
    r.tick((_w, f) => input(f[0]!, -dir, held));
    if (reverse < 0 && k.body.yawRate * dir < 0) reverse = t;
    if (restored < 0 && k.drive.drift === 0) restored = t;
    if (aligned < 0 && slip(k) <= 3) aligned = t;
    minSpeed = Math.min(minSpeed, speedOf(k));
  }
  counter.push({ direction: dir > 0 ? 'left' : 'right', boost, shiftHeldDuringCounter: held,
    initialSlipDeg: round(initialSlipDeg), initialYawRadPerSec: round(initialYaw),
    yawReversalMs: reverse < 0 ? null : round(reverse * 1000 / 60), restorationMs: restored < 0 ? null : round(restored * 1000 / 60),
    alignmentWithin3DegMs: aligned < 0 ? null : round(aligned * 1000 / 60), minSpeedMps: round(minSpeed),
    newUnrequestedDrifts: k.stats.drifts - 1, target: { yawReversalMaxMs: 150, restorationMaxMs: 500, newUnrequestedDrifts: 0 },
    pass: reverse > 0 && reverse <= 9 && restored > 0 && restored <= 30 && k.stats.drifts === 1 });
}

const repeat = [];
for (const presses of [1, 2, 3]) {
  const { r, k } = rig(); let turn = 0, distance = 0, lastVelocityHeading = 0, lastYaw = 0, maxYawAccel = 0;
  for (let t = 0; t < 120; t++) {
    const press = t === 0 || presses >= 2 && t === 12 || presses === 3 && t === 24;
    const held = !(presses >= 2 && t === 11 || presses === 3 && t === 23);
    r.tick((_w, f) => input(f[0]!, 1, held, press));
    const heading = angle(-k.body.vz, k.body.vx);
    if (t >= 60) { turn += wrap(heading - lastVelocityHeading); distance += speedOf(k) / 60; }
    maxYawAccel = Math.max(maxYawAccel, Math.abs(k.body.yawRate - lastYaw) * 60);
    lastVelocityHeading = heading; lastYaw = k.body.yawRate;
  }
  repeat.push({ presses, measurementWindowSeconds: [1, 2], meanVelocityCurveRadiusM: round(distance / turn),
    distanceM: round(distance), velocityTurnDeg: round(turn * 180 / Math.PI), maxYawAccelerationRadPerSec2: round(maxYawAccel) });
}
const repeatPass = repeat[1]!.meanVelocityCurveRadiusM < repeat[0]!.meanVelocityCurveRadiusM * 0.97
  && repeat[2]!.meanVelocityCurveRadiusM < repeat[1]!.meanVelocityCurveRadiusM * 0.97
  && repeat.every((r) => r.maxYawAccelerationRadPerSec2 <= P.yawAccel + 60 / 4096);

const shortPress = [];
for (const pressMs of [20, 50, 100]) {
  const { r, k } = rig(), filter = new InputActionFilter();
  const actions: DriveActions = { up: true, down: false, left: true, right: false, drift: true, boost: false };
  let released = false, end = 0, slideTicks = 0, travel = 0, sideTravel = 0, peakSlip = 0, peakLateral = 0, minSpeed = P.vGrip;
  for (let t = 0; t < 120; t++) {
    const now = (t + 1) * 1000 / 60;
    if (!released && now >= pressMs) { filter.advance(actions, pressMs); actions.drift = false; released = true; }
    r.tick((_w, f) => filter.sample(actions, now, t === 0 ? Edge.DRIFT : 0, f[0]!));
    const sl = slip(k), side = Math.abs(lateral(k)), v = speedOf(k);
    peakSlip = Math.max(peakSlip, sl); peakLateral = Math.max(peakLateral, side); minSpeed = Math.min(minSpeed, v);
    if (sl > 3) { slideTicks++; travel += v / 60; sideTravel += side / 60; }
    if (end === 0 && k.stats.drifts > 0 && k.drive.drift === 0) end = t + 1;
  }
  shortPress.push({ pressMs, driftStateDurationMs: round(end * 1000 / 60), physicalSkidThresholdDeg: 3,
    physicalSkidDurationMs: round(slideTicks * 1000 / 60), pathTravelDuringSkidM: round(travel), lateralTravelDuringSkidM: round(sideTravel),
    peakSlipDeg: round(peakSlip), peakLateralSpeedMps: round(peakLateral), minSpeedMps: round(minSpeed),
    target: { minimumPhysicalSkidMs: 500, driftStateDurationMs: [800, 950] }, pass: slideTicks >= 30 && end >= 48 && end <= 57 });
}

const boostRig = rig(), boostCurve = []; boostRig.k.drive.boosters = 1;
let ninety = -1, maximum = 0, lastSpeed = P.vGrip, maxStep = 0;
for (let t = 0; t < 180; t++) {
  boostRig.r.tick((_w, f) => { input(f[0]!, 0, false); f[0]!.edges = t === 0 ? Edge.USE_ITEM : 0; });
  const v = speedOf(boostRig.k); maximum = Math.max(maximum, v); maxStep = Math.max(maxStep, v - lastSpeed); lastSpeed = v;
  if (ninety < 0 && v >= P.vGrip + 0.9 * (P.vBoost - P.vGrip)) ninety = t + 1;
  if ([0, 11, 29, 59, 89, 149, 179].includes(t)) boostCurve.push({ ms: round((t + 1) * 1000 / 60), speedMps: round(v), hudKmh: round(v * KMH_PER_MPS) });
}

const uTurns = [];
for (const side of [-1, 1]) for (const s of schedules.scenarios) {
  const kit = cornerKit(s.radiusM, 180, 12, side > 0 ? 'L' : 'R'), r = racingRig(kit.track);
  const k = place(r, 0, { s: 150, u: side * s.initialU, speed: P.vGrip }), filter = new InputActionFilter();
  let previous: DriveActions = { up: true, down: false, left: false, right: false, drift: false, boost: false };
  let contacts = 0, minSpeed = P.vGrip, maxU = 0, ticks = 0;
  for (; ticks < 520; ticks++) {
    const turn = ticks >= s.entryTick && ticks < s.entryTick + s.turnTicks;
    const restore = ticks >= s.entryTick + s.turnTicks && ticks < s.entryTick + s.turnTicks + s.counterTicks;
    const steer = turn ? side : restore ? -side : 0;
    const actions = { ...previous, left: steer > 0, right: steer < 0, drift: turn || restore };
    filter.advance(previous, ticks * 1000 / 60);
    r.tick((_w, f) => filter.sample(actions, ticks * 1000 / 60, ticks === s.entryTick ? Edge.DRIFT : 0, f[0]!)); previous = actions;
    if (k.body.wallContact) contacts++;
    minSpeed = Math.min(minSpeed, speedOf(k)); maxU = Math.max(maxU, Math.abs(k.race.loc.u));
    if (k.race.loc.s >= kit.arcEnd + 60) break;
  }
  const heading = angle(-k.body.vz, k.body.vx) * 180 / Math.PI, headingError = Math.abs(Math.abs(heading) - 180);
  const completed = k.race.loc.s >= kit.arcEnd + 60;
  uTurns.push({ radiusM: s.radiusM, widthM: 12, direction: side > 0 ? 'left' : 'right', schedule: s,
    durationMs: round((ticks + 1) * 1000 / 60), minSpeedMps: round(minSpeed), maxAbsRoadOffsetM: round(maxU),
    velocityHeadingDeg: round(heading), headingErrorDeg: round(headingError), contacts, respawns: k.stats.respawns, completed,
    target: { contacts: 0, respawns: 0, headingErrorMaxDeg: 2, mustPassArcExitByM: 60 },
    pass: completed && contacts === 0 && k.stats.respawns === 0 && headingError < 2 });
}

const pass = counter.every((v) => v.pass) && repeatPass && shortPress.every((v) => v.pass)
  && maximum <= P.vBoost + 2 / 4096 && maxStep <= P.aBoostMax / 60 + 1 / 4096 && uTurns.every((v) => v.pass);
const report = {
  schemaVersion: 1, simVersion: SIM_VERSION, generatedAtUtc: new Date().toISOString(), physicsSourceSha256: sourceHash, sourceFiles,
  method: '60Hz authority on flat/corner fixtures; same keyboard filter for timed short presses and fixed U-turns; initial pose set once; no AI or subsequent world overrides. Times are measured from the control transition to the resulting physics tick.',
  kart: 'pebble', tickMs: 1000 / 60, normalSpeedMps: P.vGrip, motorBoostCapMps: P.vBoost,
  counter, repeatPress: { rows: repeat, target: 'each extra press reduces radius by at least 3%, with bounded yaw acceleration', maximumYawAccelerationRadPerSec2: P.yawAccel, quantizationAllowanceRadPerSec2: 60 / 4096, pass: repeatPass },
  shortPress, boost: { curve: boostCurve, timeTo90PercentGainMs: round(ninety * 1000 / 60), maximumSpeedMps: round(maximum),
    maximumPerTickGainMps: round(maxStep), targetCapMps: P.vBoost, capIsMotorOnly: true },
  uTurns, strongerTractionComparison: schedules.strongerTractionComparison, pass,
};
const out = resolve(process.argv[2] ?? resolve(root, 'docs/research/handling-v10-metrics.json'));
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out, pass, counterCases: counter.length, uTurnCases: uTurns.length, physicsSourceSha256: sourceHash }));
if (!pass) process.exitCode = 1;
