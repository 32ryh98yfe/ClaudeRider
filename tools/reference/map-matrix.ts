// Repeatable map acceptance after a driving-model change. Uses cached .ctrk files; never bakes or edits goldens.
// node tools/reference/map-matrix.ts /tmp/matrix.json [--baseline /tmp/before.json] [--tracks id,id]
// Optional subsets: --seeds 4242,2026,7301 --fields solo,pack --modes speed,item,infinite,timeAttack --max-ticks 28800
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { loadContent, type TrackId, type ModeId } from '@cr/content';
import { loadCtrk, toArrayBuffer, SIM_VERSION, Phase, type BakedTrack, type KartState, type WorldState } from '@cr/sim';
import { runRace, type BotSetup } from '@cr/sim/ai/balance.ts';

const args = process.argv.slice(2);
const output = args.shift();
if (!output || output.startsWith('--')) throw new Error('Usage: node tools/reference/map-matrix.ts <output.json> [--baseline <before.json>] [--tracks id,id] [--seeds 4242,2026,7301] [--fields solo,pack] [--modes speed,item,infinite,timeAttack] [--max-ticks 28800]');
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]!, value = args[i + 1];
  if (!['--baseline', '--tracks', '--seeds', '--fields', '--modes', '--max-ticks'].includes(key) || !value || value.startsWith('--')) throw new Error(`Invalid option ${key}`);
  options.set(key, value);
}
const seeds = (options.get('--seeds') ?? '4242,2026,7301').split(',').map(Number);
if (seeds.some((s) => !Number.isInteger(s) || s < 0)) throw new Error('Seeds must be nonnegative integers');
const fields = (options.get('--fields') ?? 'solo,pack').split(',') as ('solo' | 'pack')[];
if (fields.some((f) => f !== 'solo' && f !== 'pack')) throw new Error('Fields must be solo or pack');
const modes = (options.get('--modes') ?? 'speed,item,infinite,timeAttack').split(',') as ModeId[];
if (modes.some((m) => !['speed', 'item', 'infinite', 'timeAttack'].includes(m))) throw new Error('Unknown supported mode');
const maxTicks = Number(options.get('--max-ticks') ?? 60 * 60 * 8);
if (!Number.isInteger(maxTicks) || maxTicks < 1) throw new Error('max-ticks must be a positive integer');
const content = loadContent();
const directory = new URL('../../apps/client/public/tracks/', import.meta.url);
// A partial CLI bake rewrites index.json to that subset. The content catalog remains the full acceptance roster.
const knownIds = content.tracks.all.map((t) => t.id as string);
const ids = options.get('--tracks')?.split(',') ?? [...knownIds].sort();
if (ids.some((id) => !knownIds.includes(id))) throw new Error('Requested track is absent from the content catalog');
const solo: BotSetup[] = [{ tier: 'legend', character: 'clay', kart: 'pebble', noJitter: true }];
const characters = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const karts = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
const pack: BotSetup[] = characters.map((character, i) => ({ tier: 'pro', character, kart: karts[i]! }));
const round = (v: number): number => Math.round(v * 1000) / 1000;

interface Location {
  path: number; pathName: string; s: number; sMain: number; lateral: number;
  x: number; y: number; z: number; speed: number; grounded: boolean;
  features: string[];
}
interface Incident { kind: 'hardHit' | 'respawn' | 'stuck' | 'uncreditedGate' | 'uncreditedFinish' | 'unfinished'; slot: number; tick: number; seconds: number; at: Location; before: Location | null; combatContext: { hardCC: number; softEffectMask: number; hitsTaken: number; ticksSinceOpponentHit: number | null }; details: Record<string, number | string | number[]> }
interface Tracker { previous: Location | null; hard: number; respawns: number; lastS: number; lap: number; finish: boolean; keyMask: number; distance: number; movedAt: number; maxStuckTicks: number; stuckLocation: Location | null; gates: number; hitsTaken: number; lastCombatHitTick: number }

/** Context only: proximity to a feature is not evidence that the feature caused an incident. */
function location(track: BakedTrack, k: KartState): Location {
  const r = k.race.loc, b = k.body;
  const features: string[] = [];
  for (let i = 0; i < track.jumps.length; i++) {
    const j = track.jumps[i]!;
    if (j.path === r.path && r.s >= j.lipS - 25 && r.s <= j.landS1 + 25) features.push(`jump:${i}`);
  }
  for (let i = 0; i < track.rails.length; i++) {
    const rail = track.rails[i]!;
    if (rail.path === r.path || rail.host === r.path && r.s >= (rail.hostFrom ?? rail.fromS) - 25 && r.s <= (rail.hostTo ?? rail.toS) + 25) features.push(`rail:${i}`);
  }
  for (let i = 0; i < track.warps.length; i++) {
    const warp = track.warps[i]!;
    if (warp.path === r.path && Math.abs(warp.s - r.s) < 25 || warp.exitPath === r.path && Math.abs(warp.exitS - r.s) < 25) features.push(`warp:${i}`);
  }
  for (let i = 0; i < track.zones.length; i++) {
    const z = track.zones[i]!;
    if (z.path === r.path && r.s >= z.s0 - 10 && r.s <= z.s1 + 10) features.push(`zone:${i}:${z.kind}`);
  }
  for (const hazard of track.hazards) {
    const motion = hazard.motion;
    const near = motion?.s0 !== undefined && motion.s1 !== undefined ? r.s >= motion.s0 - 15 && r.s <= motion.s1 + 15 : Math.abs(hazard.s - r.s) < 25;
    if (hazard.path === r.path && near) features.push(`hazard:${hazard.id}:${hazard.name ?? hazard.kind}`);
  }
  return { path: r.path, pathName: track.path(r.path).id, s: round(r.s), sMain: round(r.sMain), lateral: round(r.u), x: round(b.px), y: round(b.py), z: round(b.pz), speed: round(Math.hypot(b.vx, b.vy, b.vz)), grounded: b.grounded === 1, features };
}

function observe(track: BakedTrack, n: number) {
  const incidents: Incident[] = [];
  const trackers: Tracker[] = Array.from({ length: n }, () => ({ previous: null, hard: 0, respawns: 0, lastS: 0, lap: -1, finish: false, keyMask: 0, distance: -1e9, movedAt: 0, maxStuckTicks: 0, stuckLocation: null, gates: 0, hitsTaken: 0, lastCombatHitTick: -1 }));
  let final: WorldState | null = null;
  let totalIncidents = 0;
  const add = (w: WorldState, k: KartState, kind: Incident['kind'], details: Incident['details'] = {}) => {
    totalIncidents++;
    // Bound report size in pathological respawn loops, retaining the first locations and true total.
    if (incidents.length >= 1000) return;
    const lastHit = trackers[k.slot]!.lastCombatHitTick;
    incidents.push({ kind, slot: k.slot, tick: w.tick, seconds: round((w.tick - w.goTick) / 60), at: location(track, k), before: trackers[k.slot]!.previous,
      combatContext: { hardCC: k.status.cc, softEffectMask: k.status.modMask, hitsTaken: k.stats.hitsTaken, ticksSinceOpponentHit: lastHit < 0 ? null : w.tick - lastHit }, details });
  };
  const tick = (w: WorldState) => {
    final = w;
    if (w.phase < Phase.RACING) return;
    for (let i = 0; i < n; i++) {
      const k = w.karts[i]!, r = k.race, t = trackers[i]!;
      if (k.stats.hitsTaken > t.hitsTaken) t.lastCombatHitTick = w.tick;
      t.hitsTaken = k.stats.hitsTaken;
      if (r.finishTick < 0 && !t.finish) {
        if (k.stats.hardHits > t.hard) add(w, k, 'hardHit', { count: k.stats.hardHits - t.hard });
        if (k.stats.respawns > t.respawns) add(w, k, 'respawn', { count: k.stats.respawns - t.respawns });
        if (r.raceDist > t.distance + 2) { t.distance = r.raceDist; t.movedAt = w.tick; }
        const stuck = w.tick - t.movedAt;
        if (stuck > t.maxStuckTicks) { t.maxStuckTicks = stuck; if (stuck >= 180) t.stuckLocation = location(track, k); }
        if (stuck === 180) add(w, k, 'stuck', { noProgressTicks: stuck, minimumProgressM: 2 });
        if (t.previous && r.lap >= 0 && r.respawnPhase === 0 && r.loc.sMain > t.lastS && r.loc.sMain - t.lastS < 20) {
          for (let gate = 0; gate < track.keyGates.length; gate++) {
            const station = Math.round(track.keyGates[gate]! * 4096) / 4096;
            if (t.lastS <= station && r.loc.sMain > station && (r.keyMask & (1 << gate)) === 0) { add(w, k, 'uncreditedGate', { gate, station, keyMask: r.keyMask }); t.gates++; }
          }
        }
        if (t.previous && t.lap >= 0 && r.respawnPhase === 0) {
          const crossed = track.topology === 'circuit' ? t.lastS > track.lapLength - 60 && r.loc.sMain < 60 : t.lastS <= track.lapLength && r.loc.sMain > track.lapLength;
          if (crossed && r.lap === t.lap) {
            const missing = track.keyGates.map((_s, g) => g).filter((g) => (t.keyMask & (1 << g)) === 0);
            add(w, k, 'uncreditedFinish', { missingGates: missing, keyMask: t.keyMask });
          }
        }
      }
      t.hard = k.stats.hardHits; t.respawns = k.stats.respawns; t.lastS = r.loc.sMain; t.lap = r.lap; t.keyMask = r.keyMask; t.finish = r.finishTick >= 0;
      // Retain the immediately preceding pose for takeoff/collision diagnostics without a complete telemetry log.
      t.previous = { path: r.loc.path, pathName: track.path(r.loc.path).id, s: round(r.loc.s), sMain: round(r.loc.sMain), lateral: round(r.loc.u), x: round(k.body.px), y: round(k.body.py), z: round(k.body.pz), speed: round(Math.hypot(k.body.vx, k.body.vy, k.body.vz)), grounded: k.body.grounded === 1, features: [] };
    }
  };
  return {
    tick,
    finish() {
      if (final) for (let i = 0; i < n; i++) {
        const k = final.karts[i]!;
        if (k.race.finishTick < 0) add(final, k, 'unfinished', { retired: k.race.retired, lap: k.race.lap, keyMask: k.race.keyMask, missingGates: track.keyGates.map((_s, g) => g).filter((g) => (k.race.keyMask & (1 << g)) === 0) });
      }
      return { incidents, totalIncidents, truncated: totalIncidents > incidents.length, slots: trackers.map((t, slot) => ({ slot, uncreditedGates: t.gates, maxStuckTicks: t.maxStuckTicks, stuckLocation: t.stuckLocation, finalLocation: t.previous })) };
    },
  };
}

// Load every bake up front so a concurrent candidate bake cannot mix input versions in a running baseline.
const tracks = ids.map((id) => {
  const bytes = readFileSync(new URL(`${id}.ctrk`, directory));
  const definition = content.tracks.get(id as TrackId);
  return { id, modes: modes.filter((mode) => definition.modes.includes(mode === 'infinite' || mode === 'timeAttack' ? 'speed' : mode)), track: loadCtrk(toArrayBuffer(bytes)), sha256: createHash('sha256').update(bytes).digest('hex') };
});
const sourceDirectory = new URL('../../', import.meta.url).pathname;
let revision = 'unversioned-snapshot', dirty: string[] = [];
try {
  revision = execFileSync('git', ['-C', sourceDirectory, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  dirty = execFileSync('git', ['-C', sourceDirectory, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
} catch { /* A git-archive baseline has no .git; identify its real source files instead of the caller's checkout. */ }
const sourcePaths = ['packages/sim/src/kart/dynamics.ts', 'packages/sim/src/kart/params.ts', 'packages/sim/src/ai/driver.ts', 'packages/sim/src/ai/api.ts',
  'packages/sim/src/ai/predict.ts', 'packages/sim/src/ai/plan.ts', 'packages/sim/src/ai/avoid.ts', 'packages/sim/src/ai/items/decide.ts', 'packages/sim/src/ai/profiles.ts',
  'packages/sim/src/core/state.ts', 'packages/sim/src/items/projectiles.ts', 'packages/content/src/karts/pebble.ts'];
const fingerprintSource = () => Object.fromEntries(sourcePaths.map((path) =>
  [path, createHash('sha256').update(readFileSync(new URL(path, new URL('../../', import.meta.url)))).digest('hex')]));
function sourceTreeHash(): string {
  const digest = createHash('sha256');
  const visit = (relative: string): void => {
    const directory = new URL(relative, new URL('../../', import.meta.url));
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = relative + entry.name;
      if (entry.isDirectory()) visit(path + '/');
      else if (entry.isFile() && entry.name.endsWith('.ts')) digest.update(path).update(readFileSync(new URL(path, new URL('../../', import.meta.url))));
    }
  };
  visit('packages/sim/src/'); visit('packages/content/src/');
  return digest.digest('hex');
}
const sourceFingerprints = fingerprintSource(), sourceTreeSha256 = sourceTreeHash();
let sourceFingerprintsAfter: Record<string, string> | null = null, sourceTreeSha256After: string | null = null;
const rows: ReturnType<typeof scenario>[] = [];
const before = options.has('--baseline') ? JSON.parse(readFileSync(options.get('--baseline')!, 'utf8')) as { itemCombat?: boolean; rows: { key: string; completionRatio: number; hardHits: number; respawns: number; maxStuckTicks: number; winnerSeconds: number | null }[] } : null;
if (before && modes.includes('item') && before.itemCombat !== true) throw new Error('The baseline must enable the same item-combat harness; pickup-only item races are not comparable');
const baseline = new Map(before?.rows.map((r) => [r.key, r]));
const total = tracks.reduce((sum, tr) => sum + tr.modes.reduce((count, mode) => count + seeds.length * fields.filter(field => mode !== 'timeAttack' || field === 'solo').length, 0), 0);
if (before) for (const tr of tracks) for (const mode of tr.modes) for (const field of fields) for (const seed of seeds) {
  if (mode === 'timeAttack' && field !== 'solo') continue;
  const key = `${tr.id}/${mode}/${field}/${seed}`;
  if (!baseline.has(key)) throw new Error(`Baseline is missing scenario ${key}`);
}
console.log(`matrix started: revision=${revision.slice(0, 8)} sim=${SIM_VERSION} ${tracks.length} cached maps, ${total} races, sequential`);

function scenario(tr: typeof tracks[number], mode: ModeId, field: 'solo' | 'pack', seed: number) {
  const bots = field === 'solo' ? solo : pack;
  const observer = observe(tr.track, bots.length);
  const started = performance.now();
  const result = runRace({ track: tr.track, content, bots, seed, laps: 1, mode, itemCombat: mode === 'item', lookahead: 8, maxTicks, onTick: observer.tick });
  const diagnostics = observer.finish();
  const finished = result.karts.filter((k) => k.finished);
  return {
    key: `${tr.id}/${mode}/${field}/${seed}`, id: tr.id, mode, field, seed,
    trackHash: tr.track.hash, sha256: tr.sha256, elapsedSeconds: round((performance.now() - started) / 1000),
    completionRatio: finished.length / bots.length, finished: finished.length, kartCount: bots.length,
    winnerSeconds: finished.length ? round(Math.min(...finished.map((k) => k.raceTicks / 60))) : null,
    hardHits: result.karts.reduce((sum, k) => sum + k.hardHits, 0), respawns: result.karts.reduce((sum, k) => sum + k.respawns, 0),
    maxStuckTicks: Math.max(...result.karts.map((k) => k.maxStuckTicks)),
    bumps: result.bumps, hardBumps: result.hardBumps, startHardBumps: result.startHardBumps,
    itemCombat: mode === 'item', itemsUsed: result.itemsUsed, effectHits: result.effectHits, combatEffectHits: result.combatEffectHits,
    hardCCAssociatedStalls: diagnostics.incidents.filter((i) => i.kind === 'stuck' && i.combatContext.hardCC !== 0).length,
    hardCCAssociatedHardHits: diagnostics.incidents.filter((i) => i.kind === 'hardHit' && i.combatContext.hardCC !== 0).length,
    karts: result.karts.map((k) => ({ ...k, seconds: round(k.raceTicks / 60) })), ...diagnostics,
  };
}

function save(complete: boolean) {
  const differences = rows.flatMap((r) => {
    const b = baseline.get(r.key);
    return b ? [{ key: r.key, completionRatio: r.completionRatio - b.completionRatio, hardHits: r.hardHits - b.hardHits, respawns: r.respawns - b.respawns, maxStuckTicks: r.maxStuckTicks - b.maxStuckTicks, winnerSeconds: r.winnerSeconds !== null && b.winnerSeconds !== null ? round(r.winnerSeconds - b.winnerSeconds) : null }] : [];
  });
  const summary = { races: rows.length, expectedRaces: total, completeRaces: rows.filter((r) => r.completionRatio === 1).length, finishedKarts: rows.reduce((s, r) => s + r.finished, 0), totalKarts: rows.reduce((s, r) => s + r.kartCount, 0), hardHits: rows.reduce((s, r) => s + r.hardHits, 0), respawns: rows.reduce((s, r) => s + r.respawns, 0), maxStuckTicks: rows.length ? Math.max(...rows.map((r) => r.maxStuckTicks)) : 0,
    itemsUsed: rows.reduce((s, r) => s + r.itemsUsed, 0), effectHits: rows.reduce((s, r) => s + r.effectHits, 0), combatEffectHits: rows.reduce((s, r) => s + r.combatEffectHits, 0) };
  const acceptance = {
    allFieldsFinish: rows.every(r => r.completionRatio === 1),
    maximumStallTicks: 300,
    noLongStalls: rows.every(r => r.maxStuckTicks <= 300),
    soloWithoutHardContactsOrResets: rows.filter(r => r.field === 'solo').every(r => r.hardHits === 0 && r.respawns === 0),
    nonItemWithoutResets: rows.filter(r => r.mode !== 'item').every(r => r.respawns === 0),
  };
  writeFileSync(output!, JSON.stringify({ version: 2, complete, acceptance, revision, dirty, sourceDirectory, sourceFingerprints, sourceFingerprintsAfter,
    sourceTreeSha256, sourceTreeSha256After, sourceStable: complete && sourceTreeSha256After === sourceTreeSha256,
    simVersion: SIM_VERSION, seeds, fields, modes, itemCombat: true,
    itemAuthority: 'decisions.ts local authority hooks; HalfSipHash key [0x6c32a11e, seed, 0x1ee7c0de, 0x0badf00d]; item brain receives the race cfg',
    laps: 1, lookahead: 8, maxTicks, bots: { solo, pack }, caveats: ['Pack races use the normal 10-second retirement timer; a retired kart is not by itself proof of an impassable map.', 'Item-effect hits include self/defensive effects; combatEffectHits counts hits from another racer, excluding track hazards.', 'Combat context is recorded without discarding any incident or changing the baseline regression thresholds.', 'Feature proximity is context, not causal attribution.', 'Single-lap bot acceptance does not establish reference-video fidelity or human drivability.'], summary, differences, rows }, null, 2) + '\n');
  return summary;
}

save(false);
for (const tr of tracks) {
  const first = rows.length;
  for (const mode of tr.modes) for (const field of fields) for (const seed of seeds) { if (mode === 'timeAttack' && field !== 'solo') continue; rows.push(scenario(tr, mode, field, seed)); save(false); }
  const group = rows.slice(first);
  console.log(`${tr.id}: ${group.filter((r) => r.completionRatio === 1).length}/${group.length} full fields, hard=${group.reduce((s, r) => s + r.hardHits, 0)} respawn=${group.reduce((s, r) => s + r.respawns, 0)} (${rows.length}/${total})`);
}
sourceFingerprintsAfter = fingerprintSource(); sourceTreeSha256After = sourceTreeHash();
if (sourceTreeSha256After !== sourceTreeSha256 || sourcePaths.some((path) => sourceFingerprintsAfter![path] !== sourceFingerprints[path])) {
  // Retain the completed rows as an explicitly incomplete audit; never certify a
  // matrix whose imported modules and on-disk provenance changed during the run.
  save(false);
  throw new Error('Simulation/content sources changed during the matrix; freeze the source and rerun');
}
const summary = save(true);
console.log(`matrix saved: ${summary.finishedKarts}/${summary.totalKarts} karts finished; ${output}`);
// Pack collisions can be intentional. New respawns, solo hard impacts, or completion/stall regressions need review.
if (before) {
  const regressed = rows.filter((r) => { const b = baseline.get(r.key); return b && (r.completionRatio < b.completionRatio || r.respawns > b.respawns || r.field === 'solo' && r.hardHits > b.hardHits || r.maxStuckTicks > Math.max(300, b.maxStuckTicks + 120)); });
  if (regressed.length) { console.log(`map regressions requiring review: ${regressed.map((r) => r.key).join(', ')}`); process.exitCode = 1; }
} else if (rows.some(r => r.completionRatio < 1 || r.maxStuckTicks > 300 || r.field === 'solo' && r.hardHits > 0 || (r.field === 'solo' || r.mode !== 'item') && r.respawns > 0)) process.exitCode = 1;
