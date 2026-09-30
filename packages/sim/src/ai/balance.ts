// Headless race runner for AI balance work (tools/balance/tiers.ts, packages/sim/test/ai-*.test.ts).
// Drives bots exactly like a room does: decide at t, apply through the lookahead delay line, step.
// Pure (no node APIs): the caller passes the baked track, content and, optionally, a clock for timing.
import type { AiTier, CharacterId, ContentTables, KartBodyId, ModeId } from '@cr/content';
import type { InputFrame } from '../core/input.ts';
import { makeInput } from '../core/input.ts';
import { Phase, type RaceConfig, type SlotConfig, type WorldState } from '../core/state.ts';
import { createWorld } from '../core/world.ts';
import { makeContext } from '../api.ts';
import { step } from '../step.ts';
import { ArraySink, type SimEvent } from '../core/events.ts';
import { raceTicksOf } from '../race/progress.ts';
import type { BakedTrack } from '../track/BakedTrack.ts';
import { AI_TIERS, type AiProfile } from './api.ts';
import { createAiDriver, type AiDriverEx, type AiDriverStats } from './driver.ts';
import type { AiRole } from './hooks.ts';
import type { AiPersonality } from './profiles.ts';
import { InputDelayLine } from './lookahead.ts';

/** Tier pace bands vs the noise-free Legend ghost (ADR-009 targets; tools/balance/tiers.ts and ai-pace.test.ts). */
export const PACE_BANDS: Readonly<Record<AiTier, { lo: number; hi: number; target: string }>> = {
  rookie: { lo: 0.86, hi: 0.90, target: '88 ± 2%' },
  racer: { lo: 0.92, hi: 0.96, target: '94 ± 2%' },
  pro: { lo: 0.965, hi: 0.995, target: '98 ± 1.5%' },
  legend: { lo: 0.995, hi: 1.02, target: '≥ 99.5%' },
};

export interface BotSetup { tier: AiTier; character?: CharacterId; personality?: AiPersonality; kart?: KartBodyId; role?: AiRole; noJitter?: boolean; overrides?: Partial<AiProfile>; startOffset?: number }

export interface RaceSetup {
  track: BakedTrack;
  content: ContentTables;
  bots: readonly BotSetup[];
  seed: number;
  laps?: number;
  mode?: ModeId;
  /** Bot lookahead (RaceRoom uses 8). */
  lookahead?: number;
  /** Stop after this many ticks past GO (default: hard cap). */
  maxTicks?: number;
  /** Optional clock (ms) to time the AI separately from step(). */
  now?: () => number;
  /** Called after every step (tests can inspect the world). */
  onTick?: (w: WorldState, applied: readonly InputFrame[]) => void;
}

export interface KartResult {
  slot: number; tier: AiTier; character: CharacterId | undefined; finished: boolean; raceTicks: number; bestLapTicks: number;
  drifts: number; instantBoosts: number; boostsUsed: number; wallHits: number; hardHits: number; respawns: number; startTier: number;
  draftBursts: number; driftMeters: number; bumps: number; hardBumps: number; maxStuckTicks: number; hazardHits: number; ai: AiDriverStats;
}

export interface RaceOutcome { ticks: number; karts: KartResult[]; bumps: number; hardBumps: number; /** hard bumps in the first 5 s after GO (start pile-ups) */ startHardBumps: number; aiMs: number; stepMs: number; decides: number; drivers: readonly AiDriverEx[] }

export function runRace(o: RaceSetup): RaceOutcome {
  const { track, content } = o;
  const LA = o.lookahead ?? 0;
  const slots: SlotConfig[] = o.bots.map((b, i) => ({
    kind: 'bot', team: 0, name: `bot${i}`, characterId: b.character ?? 'clay', kartBodyId: b.kart ?? 'pebble', ai: b.tier,
    vMul: b.role === 'ghost' ? 1 : b.overrides?.vMul ?? AI_TIERS[b.tier].vMul,
  }));
  const cfg: RaceConfig = {
    simVersion: 1, mode: o.mode ?? 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: o.laps ?? track.laps, slots, seed: o.seed,
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180,
  };
  const w = createWorld(cfg, track, content);
  const sink = new ArraySink();
  const ctx = makeContext({ track, cfg, content, role: 'authority', events: sink });
  const drivers: AiDriverEx[] = o.bots.map((b, i) => createAiDriver(track, content, i, AI_TIERS[b.tier], {
    ...b.overrides, character: b.role === 'ghost' ? undefined : b.personality ?? b.character, role: b.role, lookaheadTicks: LA, noJitter: b.noJitter, startOffsetTicks: b.startOffset, mode: o.mode,
  }, (o.seed * 7919 + i * 104729) >>> 0));
  const lines = o.bots.map(() => new InputDelayLine(LA));
  const decided: InputFrame[] = o.bots.map(() => makeInput());
  const inputs: InputFrame[] = o.bots.map(() => makeInput());
  const n = o.bots.length;
  const lastDist = new Float64Array(n).fill(-1e9), lastMove = new Int32Array(n), maxStuck = new Int32Array(n), bumps = new Int32Array(n), hardB = new Int32Array(n), hazHits = new Int32Array(n);
  const evs: SimEvent[] = [];
  const now = o.now;
  let aiMs = 0, stepMs = 0, decides = 0, totalBumps = 0, totalHard = 0, startHard = 0;
  const cap = o.maxTicks ?? 60 * 60 * 8;
  while (w.phase !== Phase.DONE && w.tick < w.goTick + cap) {
    const t0 = now ? now() : 0;
    for (let i = 0; i < n; i++) drivers[i]!.decide(w, decided[i]!);
    const t1 = now ? now() : 0;
    for (let i = 0; i < n; i++) lines[i]!.push(decided[i]!, inputs[i]!);
    step(w, inputs, ctx);
    const t2 = now ? now() : 0;
    aiMs += t1 - t0; stepMs += t2 - t1; decides += n;
    sink.drain(evs);
    for (const e of evs) {
      if (e.t === 'bump') {
        // every tick two overlapping karts close on each other emits one: a hard bump closes at ≥ 2 m/s (J ≥ 1.3)
        totalBumps++; if (e.a < n) bumps[e.a]!++; if (e.b < n) bumps[e.b]!++;
        if (e.impulse >= 1.3) { totalHard++; if (w.tick <= w.goTick + 300) startHard++; if (e.a < n) hardB[e.a]!++; if (e.b < n) hardB[e.b]!++; }
      }
      else if (e.t === 'effect' && e.source === 255 && e.result === 'hit' && e.victim < n) hazHits[e.victim]!++;
    }
    evs.length = 0;
    o.onTick?.(w, inputs);
    if (w.phase < Phase.RACING) continue;
    for (let i = 0; i < n; i++) {
      const k = w.karts[i]!;
      if (k.race.finishTick >= 0) { lastMove[i] = w.tick; continue; }
      if (k.race.raceDist > lastDist[i]! + 2) { lastDist[i] = k.race.raceDist; lastMove[i] = w.tick; }
      const st = w.tick - lastMove[i]!;
      if (st > maxStuck[i]!) maxStuck[i] = st;
    }
  }
  const karts: KartResult[] = o.bots.map((b, i) => {
    const k = w.karts[i]!;
    return {
      slot: i, tier: b.tier, character: b.character, finished: k.race.finishTick >= 0, raceTicks: raceTicksOf(w, k), bestLapTicks: k.race.bestLapTicks,
      drifts: k.stats.drifts, instantBoosts: k.stats.instantBoosts, boostsUsed: k.stats.boostsUsed, wallHits: k.stats.wallHits, hardHits: k.stats.hardHits,
      respawns: k.stats.respawns, startTier: k.stats.startTier, draftBursts: k.stats.draftBursts, driftMeters: k.stats.driftMeters,
      bumps: bumps[i]!, hardBumps: hardB[i]!, maxStuckTicks: maxStuck[i]!, hazardHits: hazHits[i]!, ai: drivers[i]!.stats,
    };
  });
  return { ticks: w.tick - w.goTick, karts, bumps: totalBumps, hardBumps: totalHard, startHardBumps: startHard, aiMs, stepMs, decides, drivers };
}

/**
 * Pace reference (s): the noise-free Legend ghost (14-ai §2), solo, averaged over the seven PERFECT start
 * offsets (0…6 ticks). One ghost run is a single sample of a chaotic system (a booster fired one tick
 * earlier can move a race by 1.5 s), so the mean over the PERFECT window is the stable yardstick.
 */
export function ghostRaceSec(track: BakedTrack, content: ContentTables, laps?: number, lookahead = 0, mode: ModeId = 'speed'): number {
  let sum = 0, n = 0;
  for (let d = 0; d <= 6; d++) {
    const r = runRace({ track, content, bots: [{ tier: 'legend', role: 'ghost', startOffset: d }], seed: 1, laps, lookahead, mode });
    const k = r.karts[0]!;
    if (!k.finished) return NaN;
    sum += k.raceTicks / 60; n++;
  }
  return sum / n;
}

/** One solo race for a tier/character; returns pace vs the reference race time. */
export function soloPace(track: BakedTrack, content: ContentTables, tier: AiTier, character: CharacterId | undefined, seed: number, refSec: number, laps?: number, lookahead = 0, overrides?: Partial<AiProfile>): { pace: number; sec: number; kart: KartResult } {
  const r = runRace({ track, content, bots: [{ tier, character, overrides }], seed, laps, lookahead });
  const k = r.karts[0]!;
  const sec = k.finished ? k.raceTicks / 60 : Infinity;
  return { pace: refSec / sec, sec, kart: k };
}
