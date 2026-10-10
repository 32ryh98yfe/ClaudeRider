// Compact, reproducible evidence from keyboard-play.mjs; no source frames or raw movie files enter Git.
// node tools/reference/summarize-keyboard.mjs <report.json> <keyboard.json> [...]
import { readFileSync, writeFileSync } from 'node:fs';
import { driftRequestAt, driftRequestCount } from '@cr/sim';
const [output, ...files] = process.argv.slice(2);
if (!output || !files.length) throw new Error('Expected output and at least one native keyboard recording');
const unpack = f => Array.from({ length: driftRequestCount(f.driftRequests) }, (_, i) => driftRequestAt(f.driftRequests, i));
const rows = files.map(file => {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const expected = []; let winner = 0;
  for (const event of d.raw.filter(e => e.kind === 'raw')) {
    for (const press of event.presses) { if (press === 'left') winner = -1; if (press === 'right') winner = 1; }
    if (!event.actions.left && !event.actions.right) winner = 0;
    else if (!event.actions.left) winner = 1;
    else if (!event.actions.right) winner = -1;
    for (const press of event.presses) if (press === 'drift') expected.push(winner || Math.sign(event.actions.analogSteer ?? 0));
  }
  const generated = d.raw.filter(e => e.kind === 'tick').flatMap(e => unpack(e.input));
  const applied = d.applied.flatMap(e => unpack(e.input));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const first = d.rows[0], last = d.rows.at(-1);
  return { course: d.course, initial: d.initial, renderedFps: d.renderedFps,
    receivedDirections: expected, generatedDirections: generated, appliedDirections: applied,
    orderedInputMatches: equal(expected, generated) && equal(generated, applied),
    requestBatches: d.applied.filter(e => e.input.driftRequests).map(e => ({ tick: e.tick, directions: unpack(e.input) })),
    firstTick: first.tick, lastTick: last.tick, peakSlipDeg: d.peakSlipDeg,
    minimumSpeedMps: Math.min(...d.rows.map(r => r.speed)), wallContactTicks: d.wallTicks,
    respawns: last.respawns, finalS: last.s, finalU: last.u,
    finalVelocityHeadingDeg: Math.atan2(-last.v[2], last.v[0]) * 180 / Math.PI,
    actions: d.actions, errors: d.errors, warnings: d.warnings, overlay: d.overlay,
    note: 'Native wall-clock keyboard operation; the starting state is initialized once. No autopilot, reference input injection, time warping or running-world correction.' };
});
const passed = rows.every(r => r.initial.version === 10 && !r.initial.autopilot && !r.initial.reference && r.orderedInputMatches && r.wallContactTicks === 0 && r.respawns === 0 && r.errors.length === 0 && r.overlay === 0 && r.renderedFps >= 30);
writeFileSync(output, JSON.stringify({ simVersion: 10, passed, capturedAt: new Date().toISOString(), rows }, null, 2) + '\n');
console.log(JSON.stringify({ passed, scenarios: rows.length, receivedRequests: rows.reduce((sum, r) => sum + r.receivedDirections.length, 0), appliedRequests: rows.reduce((sum, r) => sum + r.appliedDirections.length, 0) }));
if (!passed) process.exitCode = 1;
