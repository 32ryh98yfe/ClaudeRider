// Rubber-band speed cap (ADR-009; lane L1 owns the body). Pure function of public state, so every peer
// predicts it identically. Bounded to ±4%; off for Legend bots, humans and the last 15% of the race.
import type { KartState, WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';

/** Multiplier for KartMods.vCapMul (1 = neutral). Called by items/runtime computeMods when cfg.rules.rubberBand. */
export function rubberBandMul(w: Readonly<WorldState>, k: Readonly<KartState>, ctx: StepContext): number {
  void w; void k; void ctx;
  return 1;
}
