// Exact item-respawn replay and isolated body-contact counterfactuals used for the v10 review.
// Ported from the final causal audit scripts. No simulation, authority, AI or track data is changed on disk.
// node tools/reference/review-item-respawns.mjs --matrix /tmp/matrix.json --output-dir /tmp/respawn-review
// Optional: --baseline /tmp/baseline.json --tracks-dir <baked-directory> --review <case-annotations.json>
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../../packages/content/src/index.ts';
import { loadCtrk, toArrayBuffer, ArraySink, cloneWorld, makeContext, makeInput, step, SIM_VERSION, AI_TIERS } from '../../packages/sim/src/index.ts';
import { runRace } from '../../packages/sim/src/ai/balance.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2), options = new Map();
for (let i = 0; i < args.length; i += 2) {
  const key = args[i], value = args[i + 1];
  if (!['--matrix', '--output-dir', '--baseline', '--tracks-dir', '--review'].includes(key) || !value || value.startsWith('--')) throw new Error(`Invalid option ${key}`);
  options.set(key, value);
}
if (!options.has('--matrix') || !options.has('--output-dir')) throw new Error('Required: --matrix <matrix.json> --output-dir <directory>. Optional: --baseline, --tracks-dir, --review.');
const matrixFile = resolve(options.get('--matrix')), output = resolve(options.get('--output-dir'));
const directory = resolve(options.get('--tracks-dir') ?? resolve(root, 'apps/client/public/tracks'));
const reviewFile = resolve(options.get('--review') ?? resolve(root, 'docs/research/item-respawn-v10-review.json'));
const matrixBytes = readFileSync(matrixFile), matrix = JSON.parse(matrixBytes), review = JSON.parse(readFileSync(reviewFile));
const baseline = options.has('--baseline') ? JSON.parse(readFileSync(resolve(options.get('--baseline')))) : null;
const content = loadContent(), digest = bytes => createHash('sha256').update(bytes).digest('hex');
function sourceHash() {
  const hash = createHash('sha256');
  function visit(relative) {
    for (const entry of readdirSync(resolve(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = relative + entry.name;
      if (entry.isDirectory()) visit(name + '/');
      else if (entry.isFile() && entry.name.endsWith('.ts')) hash.update(name).update(readFileSync(resolve(root, name)));
    }
  }
  visit('packages/sim/src/'); visit('packages/content/src/');
  return hash.digest('hex');
}
const sourceBefore = sourceHash();
if (!matrix.complete || !matrix.sourceStable || matrix.simVersion !== SIM_VERSION || matrix.itemCombat !== true) throw new Error('Requires a complete, source-stable item-combat matrix for the current simulation version');
if (sourceBefore !== matrix.sourceTreeSha256) throw new Error('Current simulation/content source differs from the matrix. Regenerate the matrix before reviewing it.');
mkdirSync(output, { recursive: true });
const eventKinds = new Set(['effect', 'effectEnd', 'wall', 'bump', 'air', 'land', 'respawn', 'boostStart', 'boostEnd', 'itemUse', 'gear', 'escape']);
const annotations = new Map(review.cases.map(c => [`${c.scenario}/${c.slot}/${c.respawnTick}`, c]));
const counterfactuals = review.counterfactuals ?? [], snapshots = new Map(), tracks = new Map();
const rows = [], checks = [];
const scenarioKey = row => `${row.key}`;
function setup(row, track) {
  const bots = matrix.bots?.[row.field];
  if (!bots?.length || row.mode !== 'item') throw new Error(`Unsupported matrix roster/mode: ${row.key}`);
  return { track, content, bots, seed: row.seed, laps: matrix.laps, mode: row.mode, itemCombat: true, lookahead: matrix.lookahead, maxTicks: matrix.maxTicks };
}
function loadTrack(row) {
  if (tracks.has(row.id)) return tracks.get(row.id);
  const raw = readFileSync(resolve(directory, `${row.id}.ctrk`)), track = loadCtrk(toArrayBuffer(raw));
  if (track.hash !== row.trackHash || digest(raw) !== row.sha256) throw new Error(`Baked track differs from the matrix: ${row.id}`);
  tracks.set(row.id, track); return track;
}
const affected = matrix.rows.filter(r => r.respawns > 0);
for (const row of affected) {
  const targets = row.incidents.filter(i => i.kind === 'respawn'), track = loadTrack(row), events = [], states = [];
  if (row.truncated || targets.length !== row.respawns) throw new Error(`Matrix incidents are incomplete: ${row.key}`);
  for (const target of targets) if (!annotations.has(`${row.key}/${target.slot}/${target.tick}`)) throw new Error(`Unreviewed respawn: ${row.key} slot ${target.slot} tick ${target.tick}`);
  // Standalone and synchronous: restore the instrumentation even if the replay throws. It only copies events;
  // neither the authority nor the AI can read these diagnostic records back into the simulation.
  const originalPush = ArraySink.prototype.push;
  ArraySink.prototype.push = function (e) {
    if (eventKinds.has(e.t)) events.push({ ...e, ...('effect' in e ? { effectName: content.effects.byCode[e.effect]?.id } : {}) });
    originalPush.call(this, e);
  };
  let result;
  try {
    result = runRace({ ...setup(row, track), onTick: (world, applied) => {
      for (const c of counterfactuals) if (c.scenario === scenarioKey(row) && world.tick === c.snapshotTick) snapshots.set(c.id, cloneWorld(world));
      for (const target of targets) if (world.tick >= target.tick - 240 && world.tick <= target.tick + 2) {
        const k = world.karts[target.slot], b = k.body, d = k.drive;
        states.push({ target: `${target.slot}@${target.tick}`, tick: world.tick,
          p: [b.px, b.py, b.pz], v: [b.vx, b.vy, b.vz], up: [b.nx, b.ny, b.nz], f: [b.fx, b.fy, b.fz],
          grounded: b.grounded, wall: b.wallContact, airTicks: b.airTicks, loc: { ...k.race.loc }, phase: k.race.respawnPhase,
          offGraph: k.race.offGraphTicks, noGround: k.race.noGroundTicks, lowSpeed: d.lowSpeedTicks,
          cc: k.status.cc, ccEnd: k.status.ccEnd, mod: k.status.modMask,
          effects: world.effects.filter(e => e.victim === k.slot).map(e => ({ ...e, name: content.effects.byCode[e.code]?.id })),
          input: { ...applied[target.slot] }, boost: d.boostTicks, inst: d.instTicks, drift: d.drift });
      }
    } });
  } finally { ArraySink.prototype.push = originalPush; }
  const actual = events.filter(e => e.t === 'respawn' && e.phase === 'out').map(e => ({ slot: e.kart, tick: e.tick }));
  const expected = targets.map(t => ({ slot: t.slot, tick: t.tick }));
  const exact = JSON.stringify(actual) === JSON.stringify(expected);
  const entry = { key: row.key, trackHash: track.hash, ctrkSha256: row.sha256, expected, actual, exact, jumps: track.jumps,
    karts: result.karts.map(k => ({ slot: k.slot, finished: k.finished, respawns: k.respawns, hardHits: k.hardHits })), events, states };
  rows.push(entry);
  for (const target of targets) {
    const annotation = annotations.get(`${row.key}/${target.slot}/${target.tick}`);
    const foundEvents = annotation.keyEvents.every(expectedEvent => events.some(event => Object.entries(expectedEvent).every(([key, value]) => event[key] === value)));
    const frame = states.find(s => s.target === `${target.slot}@${target.tick}` && s.tick === annotation.takeoff.tick);
    const speed = frame ? Math.hypot(...frame.v) : null;
    checks.push({ scenario: row.key, slot: target.slot, tick: target.tick, exact, keyEventsMatch: foundEvents,
      takeoffSpeedMps: speed, takeoffMatches: speed !== null && Math.abs(speed - annotation.takeoff.speedMps) < 1e-6 });
  }
  writeFileSync(resolve(output, 'traces.json'), JSON.stringify({ complete: false, rows }));
  console.log(`${row.key}: exact=${exact}, respawns=${actual.length}`);
}

// The two final no-direct-hit cases start from the captured pre-impact state. Remove other actors and pending
// external projectiles/hazards to avoid retargeting them onto the isolated kart. Replay the SAME recorded input;
// never force speed, steering or position, and never turn off road collision or gravity.
const isolated = [];
for (const c of counterfactuals) {
  const row = matrix.rows.find(r => r.key === c.scenario), traced = rows.find(r => r.key === c.scenario), snapshot = snapshots.get(c.id);
  if (!row || !traced || !snapshot) throw new Error(`Counterfactual snapshot was not captured: ${c.id}`);
  const track = loadTrack(row), config = setup(row, track), bots = config.bots, slot = c.slot;
  const cfg = { simVersion: SIM_VERSION, mode: 'item', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: matrix.laps,
    slots: bots.map((bot, i) => ({ kind: 'bot', team: 0, name: `bot${i}`, characterId: bot.character ?? 'clay', kartBodyId: bot.kart ?? 'pebble', ai: bot.tier, vMul: bot.overrides?.vMul ?? AI_TIERS[bot.tier].vMul })),
    seed: row.seed, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180 };
  const recorded = new Map(traced.states.filter(s => s.target === `${slot}@${c.respawnTick}`).map(s => [s.tick, s.input]));
  const world = cloneWorld(snapshot);
  world.projectiles = []; world.hazards = []; world.effects = world.effects.filter(e => e.victim === slot);
  world.karts.forEach((kart, i) => { if (i !== slot) kart.active = 0; });
  const sink = new ArraySink(), ctx = makeContext({ track, content, cfg, role: 'authority', events: sink }), inputs = world.karts.map(() => makeInput());
  let takeoff = null, landing = null;
  for (let tick = 0; tick < 260; tick++) {
    const k = world.karts[slot], b = k.body, wasGrounded = b.grounded, input = recorded.get(world.tick + 1);
    if (!input) throw new Error(`Missing recorded control for ${c.id} tick ${world.tick + 1}`);
    Object.assign(inputs[slot], input); step(world, inputs, ctx);
    if (wasGrounded && !b.grounded && !takeoff) takeoff = { tick: world.tick, s: k.race.loc.s, speedMps: Math.hypot(b.vx, b.vy, b.vz), verticalSpeed: b.vy };
    if (takeoff && !wasGrounded && b.grounded && !landing) landing = { tick: world.tick, s: k.race.loc.s, y: b.py };
    if (k.stats.respawns > snapshot.karts[slot].stats.respawns || landing) break;
  }
  const respawns = world.karts[slot].stats.respawns - snapshot.karts[slot].stats.respawns;
  const events = sink.list.filter(e => ['wall', 'air', 'land', 'respawn', 'effect'].includes(e.t));
  const newDamage = events.some(e => e.t === 'effect' && e.victim === slot && e.source !== slot && e.result === 'hit');
  const matches = respawns === 0 && !newDamage && takeoff?.tick === c.expected.takeoffTick && landing?.tick === c.expected.landingTick
    && Math.abs(takeoff.speedMps - c.expected.takeoffSpeedMps) < 1e-6 && Math.abs(landing.s - c.expected.landingS) < 1e-6;
  isolated.push({ id: c.id, scenario: c.scenario, slot, snapshotTick: c.snapshotTick, controls: 'unchanged recorded input', takeoff, landing, respawns, newDamage, matches, events });
}
const sourceAfter = sourceHash(), seenCases = checks.length;
const complete = seenCases === review.cases.length && checks.every(c => c.exact && c.keyEventsMatch && c.takeoffMatches)
  && isolated.every(c => c.matches) && sourceBefore === sourceAfter;
const summary = { complete, matrix: basename(matrixFile), matrixSha256: digest(matrixBytes), review: basename(reviewFile),
  sourceTreeSha256: sourceBefore, sourceTreeSha256After: sourceAfter, sourceStable: sourceBefore === sourceAfter,
  baselineRespawns: baseline?.summary.respawns ?? null, matrixRespawns: matrix.summary.respawns, reviewedRespawns: seenCases,
  classificationCounts: review.classificationCounts, checks, counterfactuals: isolated,
  limitation: 'This verifies documented event order, controls and outcomes; it does not infer that all combat losses are unavoidable.' };
writeFileSync(resolve(output, 'traces.json'), JSON.stringify({ complete, rows }));
writeFileSync(resolve(output, 'review.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ complete, reviewedRespawns: seenCases, counterfactuals: isolated.map(c => ({ id: c.id, matches: c.matches })) }));
if (!complete) process.exitCode = 1;
