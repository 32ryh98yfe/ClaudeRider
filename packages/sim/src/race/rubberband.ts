// Rubber-band speed cap (ADR-009, 14-ai-spec §7). A pure function of public state (race distances, slot config), so
// every peer predicts bots identically. Bounded to ±4%; off for humans, Legend bots, Time Attack and the final 15%
// of the race, and it never lifts a bot above 1.00 (the positive band only recovers a Rookie/Racer vMul deficit).
import type { KartState, WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { DT, V_REF } from '../core/units.ts';

export const RB_BAND = 0.04;
/** Ahead of the reference: neutral up to 20 m, full −4% at 200 m. */
export const RB_AHEAD0 = 20, RB_AHEAD_SPAN = 180;
/** Behind the reference (Rookie/Racer only): neutral up to 30 m, full +4% at 250 m. */
export const RB_BEHIND0 = 30, RB_BEHIND_SPAN = 220;

const D = new Float64Array(8);

/** Race distance of a human for the reference: a finished human keeps advancing at V_REF. */
function humanDist(w: Readonly<WorldState>, k: Readonly<KartState>, ctx: StepContext): number {
  const r = k.race;
  if (r.finishTick >= 0) return ctx.cfg.laps * ctx.track.lapLength + (w.tick - r.finishTick) * V_REF * DT;
  return r.raceDist;
}

/**
 * Reference race distance: the one human's, or the lower median of the humans'. NaN when there is no human.
 */
export function referenceDist(w: Readonly<WorldState>, ctx: StepContext): number {
  let n = 0;
  const slots = ctx.cfg.slots;
  for (let i = 0; i < w.karts.length && n < D.length; i++) {
    if (slots[i]?.kind !== 'human') continue;
    const v = humanDist(w, w.karts[i]!, ctx);
    let j = n++;
    while (j > 0 && D[j - 1]! > v) { D[j] = D[j - 1]!; j--; }
    D[j] = v;
  }
  return n === 0 ? NaN : D[(n - 1) >> 1]!;
}

/**
 * Multiplier for KartMods.vCapMul (1 = neutral). computeMods has already applied the bot's tier vMul, so the value
 * returned here is clamped to 1/vMul: the product vMul·capMul stays ≤ 1.00.
 */
export function rubberBandMul(w: Readonly<WorldState>, k: Readonly<KartState>, ctx: StepContext): number {
  const cfg = ctx.cfg, sc = cfg.slots[k.slot];
  if (!cfg.rules.rubberBand || cfg.mode === 'timeAttack') return 1;
  if (!sc || sc.kind !== 'bot' || sc.ai === 'legend' || k.race.finishTick >= 0) return 1;
  const L = ctx.track.lapLength, Db = k.race.raceDist;
  if (Db >= (cfg.laps - 0.15) * L) return 1;
  const ref = referenceDist(w, ctx);
  if (ref !== ref) return 1; // no human
  const d = Db - ref;
  let cap = 1;
  if (d > RB_AHEAD0) {
    const f = (d - RB_AHEAD0) / RB_AHEAD_SPAN;
    cap = 1 - RB_BAND * (f < 1 ? f : 1);
  } else if (d < -RB_BEHIND0 && (sc.ai === 'rookie' || sc.ai === 'racer')) {
    const f = (-d - RB_BEHIND0) / RB_BEHIND_SPAN;
    cap = 1 + RB_BAND * (f < 1 ? f : 1);
    const vm = sc.vMul > 0 && sc.vMul < 1 ? sc.vMul : 1;
    if (cap * vm > 1) cap = 1 / vm;
  }
  return cap;
}
