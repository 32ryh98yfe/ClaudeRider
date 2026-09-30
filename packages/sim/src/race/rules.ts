// Race flow: phases, countdown, start boost, ranks, retire timer, race end (ADR-008).
import { Boost, Phase, type KartState, type WorldState } from '../core/state.ts';
import type { InputFrame } from '../core/input.ts';
import type { StepContext } from '../api.ts';
import { evKey } from '../kart/evkey.ts';

/** stats.startTier codes */
export const StartTier = { UNSET: 0, NONE: 1, FALSE: 2, GOOD: 3, GREAT: 4, PERFECT: 5 } as const;
const TIER_NAME = ['none', 'none', 'false', 'good', 'great', 'perfect'] as const;

export function updatePhase(w: WorldState, ctx: StepContext): void {
  const cd = ctx.cfg.countdownTicks, go = w.goTick;
  if (w.phase === Phase.PRE && w.tick >= go - cd) w.phase = Phase.COUNTDOWN;
  if (w.phase === Phase.COUNTDOWN) {
    const beat = cd / 3;
    for (let n = 3; n >= 1; n--) if (w.tick === go - n * beat) ctx.events.push({ t: 'countdown', n: n as 3 | 2 | 1, tick: w.tick, key: evKey(w.tick, 60, n) });
    if (w.tick >= go) {
      w.phase = Phase.RACING;
      ctx.events.push({ t: 'countdown', n: 0, tick: w.tick, key: evKey(w.tick, 60, 0) });
    }
  }
}

function tierFor(dT: number): number {
  if (dT >= 0 && dT <= 6) return StartTier.PERFECT;
  if ((dT >= -6 && dT < 0) || (dT > 6 && dT <= 12)) return StartTier.GREAT;
  if ((dT >= -12 && dT < -6) || (dT > 12 && dT <= 21)) return StartTier.GOOD;
  if (dT < -12 && dT >= -60) return StartTier.FALSE;
  return StartTier.NONE;
}

function applyTier(w: WorldState, k: KartState, tier: number, ctx: StepContext): void {
  const d = k.drive;
  k.stats.startTier = tier;
  const item = ctx.cfg.mode === 'item';
  const dur = tier === StartTier.PERFECT ? 90 : tier === StartTier.GREAT ? 60 : tier === StartTier.GOOD ? 36 : 0;
  if (dur > 0) { d.startTicks = item ? Math.round(dur * 0.67) : dur; d.boostKind = Boost.START; }
  if (tier === StartTier.FALSE) d.wheelspinTicks = 18;
  ctx.events.push({ t: 'startBoost', kart: k.slot, tier: TIER_NAME[tier] ?? 'none', tick: w.tick, key: evKey(w.tick, 61, k.slot) });
}

/** Called for every active kart before dynamics. Tracks throttle presses around GO. */
export function updateStartBoost(w: WorldState, k: KartState, inp: Readonly<InputFrame>, ctx: StepContext): void {
  const d = k.drive;
  if (k.stats.startTier !== StartTier.UNSET) {
    // releasing the throttle cancels a running start boost
    if (d.startTicks > 0 && inp.throttle === 0) { d.startTicks = 0; if (d.boostKind === Boost.START) d.boostKind = Boost.NONE; }
    return;
  }
  const held = inp.throttle > 0;
  const edge = held && d.prevThrottle === 0;
  if (w.tick < w.goTick) {
    if (edge) d.startPressTick = w.tick;
    if (!held) d.startPressTick = -1;
    return;
  }
  if (w.tick === w.goTick && held && d.startPressTick >= 0 && d.startPressTick < w.goTick) {
    applyTier(w, k, tierFor(d.startPressTick - w.goTick), ctx);
    return;
  }
  if (edge || (w.tick === w.goTick && held)) { applyTier(w, k, tierFor(w.tick - w.goTick), ctx); return; }
  if (w.tick > w.goTick + 21 || (held && !edge && w.tick > w.goTick)) k.stats.startTier = StartTier.NONE;
}

const ORDER: number[] = [];

/** Recomputes ranks: finished first (by finish time), then race distance, ties by previous rank. */
export function updateRanks(w: WorldState, ctx: StepContext): void {
  ORDER.length = 0;
  for (let i = 0; i < w.karts.length; i++) if (w.karts[i]!.active) ORDER.push(i);
  const K = w.karts;
  // insertion sort (deterministic, n ≤ 8)
  for (let a = 1; a < ORDER.length; a++) {
    const x = ORDER[a]!;
    let b = a - 1;
    while (b >= 0 && before(K[x]!, K[ORDER[b]!]!)) { ORDER[b + 1] = ORDER[b]!; b--; }
    ORDER[b + 1] = x;
  }
  for (let r = 0; r < ORDER.length; r++) {
    const k = K[ORDER[r]!]!;
    const nr = r + 1;
    if (k.race.rank !== nr && w.phase >= Phase.RACING) ctx.events.push({ t: 'rank', kart: k.slot, from: k.race.rank, to: nr, tick: w.tick, key: evKey(w.tick, 62, k.slot, nr) });
    k.race.rank = nr;
  }
}

function before(a: KartState, b: KartState): boolean {
  const af = a.race.finishTick >= 0, bf = b.race.finishTick >= 0;
  if (af !== bf) return af;
  if (af && bf) {
    const ta = a.race.finishTick - 1 + a.race.finishFrac, tb = b.race.finishTick - 1 + b.race.finishFrac;
    if (ta !== tb) return ta < tb;
    return a.slot < b.slot;
  }
  if (a.race.retired !== b.race.retired) return a.race.retired === 0;
  if (a.race.raceDist !== b.race.raceDist) return a.race.raceDist > b.race.raceDist;
  return a.race.rank < b.race.rank;
}

/** Retire timer, hard cap and race end. */
export function updateRaceEnd(w: WorldState, ctx: StepContext, hardCapTicks: number): void {
  if (w.phase < Phase.RACING || w.phase === Phase.DONE) return;
  let allDone = true, any = false;
  for (const k of w.karts) if (k.active) { any = true; if (k.race.finishTick < 0 && !k.race.retired) allDone = false; }
  if (w.firstFinishTick >= 0 && w.phase === Phase.RACING) w.phase = Phase.RETIRE_TIMER;
  const timerOut = w.firstFinishTick >= 0 && w.tick >= w.firstFinishTick + ctx.cfg.rules.retireTicks;
  const capOut = w.tick - w.goTick >= hardCapTicks;
  if ((any && allDone) || timerOut || capOut) {
    for (const k of w.karts) if (k.active && k.race.finishTick < 0 && !k.race.retired) {
      k.race.retired = 1;
      ctx.events.push({ t: 'retire', kart: k.slot, tick: w.tick, key: evKey(w.tick, 63, k.slot) });
    }
    w.phase = Phase.DONE;
    w.endTick = w.tick;
    updateRanks(w, ctx);
    ctx.events.push({ t: 'raceEnd', tick: w.tick, key: evKey(w.tick, 64, 0) });
  }
}
