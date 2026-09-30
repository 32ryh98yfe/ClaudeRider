// Time Attack ghosts (10-sim-spec §11, 50-test-plan "record → replay reproduces hashWorld"). A ghost is the run's
// RaceConfig essentials plus the one kart's packed input stream (run-length encoded) from tick 0, so the countdown
// and start boost replay too. Replaying the inputs through step() in a fresh world rebuilds the run exactly; the
// recorded final hashWorld proves it. Rendering a ghost means stepping that private world alongside the race
// (one kart, a few µs per tick); the ghost never interacts with the live race.
//
// Import from '@cr/sim/race/ghost.ts'. Binary layout (little-endian), version 1:
//   u32 magic 'CRG1' | u16 version | u16 simVersion | u32 seed | u8 mode | u8 laps | u16 introTicks
//   u16 countdownTicks | u32 retireTicks | u8 friendlyFire | u8 itemSet | u8 rule flags | u8 reserved
//   str trackId | str trackHash | str characterId | str kartBodyId | str name     (str = u16 length + u16 code units)
//   u32 ticks | f64 raceTicks | f64 bestLapTicks | u8 lapCount | f64 × lapCount | u32 finalHash
//   u32 runCount | runCount × (u32 packed low | u16 packed high | u16 length)
import type { CharacterId, KartBodyId, ModeId, TrackId } from '@cr/content';
import type { InputFrame } from '../core/input.ts';
import { packInput, unpackInput } from '../core/input.ts';
import type { RaceConfig, RaceRules } from '../core/state.ts';

export const GHOST_MAGIC = 0x31475243; // 'CRG1'
export const GHOST_VERSION = 1;

const MODES: readonly ModeId[] = ['speed', 'item', 'infinite', 'timeAttack'];
const FF: readonly RaceRules['friendlyFire'][] = ['off', 'area', 'all'];
const SETS: readonly RaceRules['itemSet'][] = ['standard', 'light', 'chaos'];
const TWO32 = 4294967296;

export interface Ghost {
  simVersion: number; seed: number; mode: ModeId; laps: number; introTicks: number; countdownTicks: number;
  rules: RaceRules;
  trackId: TrackId; trackHash: string; characterId: CharacterId; kartBodyId: KartBodyId; name: string;
  /** Ticks recorded (inputs for world ticks 0 … ticks − 1). */
  ticks: number;
  raceTicks: number; bestLapTicks: number; lapTicks: number[];
  /** hashWorld after the last recorded tick. */
  finalHash: number;
  /** Run-length encoded packed inputs: runs[2i] = packInput value, runs[2i + 1] = run length. */
  runs: number[];
}

/**
 * Records one kart's inputs as runs. push() is called once per tick with the frame handed to step(); it allocates
 * only when the run table grows (doubling), never per tick in steady state.
 */
export class GhostRecorder {
  private runs = new Float64Array(512);
  private n = 0;
  private last = -1;
  ticks = 0;

  push(f: Readonly<InputFrame>): void {
    const p = packInput(f);
    const i = this.n;
    if (i > 0 && p === this.last && this.runs[i - 1]! < 65535) { this.runs[i - 1] = this.runs[i - 1]! + 1; }
    else {
      if (i + 2 > this.runs.length) { const g = new Float64Array(this.runs.length * 2); g.set(this.runs); this.runs = g; }
      this.runs[i] = p; this.runs[i + 1] = 1; this.n = i + 2; this.last = p;
    }
    this.ticks++;
  }

  /** Snapshot of the recorded runs. */
  runList(): number[] { return Array.from(this.runs.subarray(0, this.n)); }

  /** Builds the ghost of a finished (or aborted) run. `cfg` is the race's config; slot 0 is the recorded kart. */
  finish(cfg: Readonly<RaceConfig>, result: { raceTicks: number; bestLapTicks: number; lapTicks: readonly number[]; finalHash: number }, slot = 0): Ghost {
    const s = cfg.slots[slot]!;
    return {
      simVersion: cfg.simVersion, seed: cfg.seed, mode: cfg.mode, laps: cfg.laps, introTicks: cfg.introTicks, countdownTicks: cfg.countdownTicks,
      rules: { ...cfg.rules }, trackId: cfg.trackId, trackHash: cfg.trackHash, characterId: s.characterId, kartBodyId: s.kartBodyId, name: s.name,
      ticks: this.ticks, raceTicks: result.raceTicks, bestLapTicks: result.bestLapTicks, lapTicks: [...result.lapTicks], finalHash: result.finalHash >>> 0,
      runs: this.runList(),
    };
  }
}

/** The RaceConfig that replays a ghost: one human slot with the ghost's kart and character. */
export function ghostConfig(g: Readonly<Ghost>): RaceConfig {
  return {
    simVersion: g.simVersion, mode: g.mode, teams: 'solo', trackId: g.trackId, trackHash: g.trackHash, laps: g.laps,
    slots: [{ kind: 'human', team: 0, name: g.name, characterId: g.characterId, kartBodyId: g.kartBodyId, vMul: 1 }],
    seed: g.seed, rules: { ...g.rules }, introTicks: g.introTicks, countdownTicks: g.countdownTicks,
  };
}

/** Walks a ghost's input stream tick by tick without expanding it. */
export class GhostPlayer {
  private readonly g: Readonly<Ghost>;
  private run = 0;
  private left: number;
  tick = 0;
  constructor(g: Readonly<Ghost>) { this.g = g; this.left = g.runs.length ? g.runs[1]! : 0; }

  /** Writes the next tick's input into `out`; returns false (and a neutral frame) past the end of the recording. */
  next(out: InputFrame): boolean {
    const r = this.g.runs;
    while (this.left === 0 && this.run + 2 < r.length) { this.run += 2; this.left = r[this.run + 1]!; }
    if (this.left === 0) { out.steer = 0; out.throttle = 0; out.brake = 0; out.held = 0; out.edges = 0; out.aim = 255; out.emote = 0; return false; }
    unpackInput(r[this.run]!, out);
    this.left--; this.tick++;
    return true;
  }
}

// ---- binary codec

class Writer {
  buf = new DataView(new ArrayBuffer(1024));
  o = 0;
  need(n: number): void {
    if (this.o + n <= this.buf.byteLength) return;
    let len = this.buf.byteLength * 2; while (len < this.o + n) len *= 2;
    const nb = new Uint8Array(len); nb.set(new Uint8Array(this.buf.buffer, 0, this.o)); this.buf = new DataView(nb.buffer);
  }
  u8(v: number): void { this.need(1); this.buf.setUint8(this.o, v); this.o += 1; }
  u16(v: number): void { this.need(2); this.buf.setUint16(this.o, v, true); this.o += 2; }
  u32(v: number): void { this.need(4); this.buf.setUint32(this.o, v >>> 0, true); this.o += 4; }
  f64(v: number): void { this.need(8); this.buf.setFloat64(this.o, v, true); this.o += 8; }
  str(s: string): void { this.u16(s.length); for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i)); }
}

class Reader {
  o = 0;
  readonly v: DataView;
  constructor(v: DataView) { this.v = v; }
  check(n: number): void { if (this.o + n > this.v.byteLength) throw new Error('ghost: truncated'); }
  u8(): number { this.check(1); const x = this.v.getUint8(this.o); this.o += 1; return x; }
  u16(): number { this.check(2); const x = this.v.getUint16(this.o, true); this.o += 2; return x; }
  u32(): number { this.check(4); const x = this.v.getUint32(this.o, true); this.o += 4; return x; }
  f64(): number { this.check(8); const x = this.v.getFloat64(this.o, true); this.o += 8; return x; }
  str(): string { const n = this.u16(); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u16()); return s; }
}

export function encodeGhost(g: Readonly<Ghost>): Uint8Array {
  const w = new Writer();
  w.u32(GHOST_MAGIC); w.u16(GHOST_VERSION); w.u16(g.simVersion); w.u32(g.seed);
  w.u8(MODES.indexOf(g.mode)); w.u8(g.laps); w.u16(g.introTicks); w.u16(g.countdownTicks);
  w.u32(g.rules.retireTicks); w.u8(FF.indexOf(g.rules.friendlyFire)); w.u8(SETS.indexOf(g.rules.itemSet));
  w.u8((g.rules.rubberBand ? 1 : 0) | (g.rules.instantBoostInItem ? 2 : 0)); w.u8(0);
  w.str(g.trackId); w.str(g.trackHash); w.str(g.characterId); w.str(g.kartBodyId); w.str(g.name);
  w.u32(g.ticks); w.f64(g.raceTicks); w.f64(g.bestLapTicks);
  w.u8(g.lapTicks.length); for (const t of g.lapTicks) w.f64(t);
  w.u32(g.finalHash);
  const nRuns = g.runs.length >> 1;
  w.u32(nRuns);
  for (let i = 0; i < nRuns; i++) {
    const p = g.runs[2 * i]!, hi = Math.floor(p / TWO32);
    w.u32(p - hi * TWO32); w.u16(hi); w.u16(g.runs[2 * i + 1]!);
  }
  return new Uint8Array(w.buf.buffer, 0, w.o).slice();
}

export function decodeGhost(bytes: Uint8Array): Ghost {
  const r = new Reader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  if (r.u32() !== GHOST_MAGIC) throw new Error('ghost: bad magic');
  const version = r.u16();
  if (version !== GHOST_VERSION) throw new Error(`ghost: unsupported version ${version}`);
  const simVersion = r.u16(), seed = r.u32();
  const mode = MODES[r.u8()], laps = r.u8(), introTicks = r.u16(), countdownTicks = r.u16();
  const retireTicks = r.u32(), friendlyFire = FF[r.u8()], itemSet = SETS[r.u8()], fl = r.u8(); r.u8();
  if (!mode || !friendlyFire || !itemSet) throw new Error('ghost: bad enum');
  const trackId = r.str() as TrackId, trackHash = r.str(), characterId = r.str() as CharacterId, kartBodyId = r.str() as KartBodyId, name = r.str();
  const ticks = r.u32(), raceTicks = r.f64(), bestLapTicks = r.f64();
  const nl = r.u8(), lapTicks: number[] = [];
  for (let i = 0; i < nl; i++) lapTicks.push(r.f64());
  const finalHash = r.u32();
  const nRuns = r.u32(), runs: number[] = [];
  for (let i = 0; i < nRuns; i++) { const lo = r.u32(), hi = r.u16(), len = r.u16(); runs.push(hi * TWO32 + lo, len); }
  return {
    simVersion, seed, mode, laps, introTicks, countdownTicks,
    rules: { retireTicks, friendlyFire, itemSet, rubberBand: (fl & 1) !== 0, instantBoostInItem: (fl & 2) !== 0 },
    trackId, trackHash, characterId, kartBodyId, name, ticks, raceTicks, bestLapTicks, lapTicks, finalHash, runs,
  };
}
