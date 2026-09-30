// Disconnect takeover and finished-kart cruise (14-ai §10, ADR-007).
// After 180 ticks (3 s) without inputs the authority drives a human's slot with the Racer profile and the
// human's own character personality, starting from wherever the kart is (mid-drift, off-line, wrong way);
// control goes back to the human on the next input. Finished karts cruise (Rookie noise, no items).
import type { CharacterId, ContentTables } from '@cr/content';
import type { InputFrame } from '../core/input.ts';
import type { SlotConfig, WorldState } from '../core/state.ts';
import type { BakedTrack } from '../track/BakedTrack.ts';
import { AI_TIERS } from './api.ts';
import { createAiDriver, type AiDriverEx } from './driver.ts';
import { mixSeed } from './rng.ts';

export const TAKEOVER_AFTER_TICKS = 180;

/** A Racer-profile driver for a disconnected human's kart (works from any mid-race state). */
export function createTakeoverDriver(track: BakedTrack, content: ContentTables, slot: number, characterId: CharacterId | undefined, seed: number, lookaheadTicks = 0): AiDriverEx {
  return createAiDriver(track, content, slot, AI_TIERS.racer, { character: characterId, role: 'takeover', lookaheadTicks }, mixSeed(seed, slot, 0x544b4f56));
}

/** Cruise controller for a kart that has finished (Rookie noise, 80% speed, no boosters, no items). */
export function createCruiseDriver(track: BakedTrack, content: ContentTables, slot: number, seed: number, lookaheadTicks = 0): AiDriverEx {
  return createAiDriver(track, content, slot, AI_TIERS.rookie, { role: 'cruise', lookaheadTicks }, mixSeed(seed, slot, 0x43525a31));
}

/**
 * Per-room helper for human slots: tracks input silence, attaches a takeover driver after 3 s, hands control
 * back on the next input, and cruises finished karts. Allocation happens only when a driver is first needed.
 */
export class TakeoverController {
  private readonly lastInput: Int32Array;
  private readonly drivers: (AiDriverEx | null)[];
  private readonly cruisers: (AiDriverEx | null)[];
  private readonly active: Uint8Array;
  private readonly track: BakedTrack;
  private readonly content: ContentTables;
  private readonly slots: readonly SlotConfig[];
  private readonly seed: number;
  private readonly lookahead: number;
  /** Takeovers started per slot (tests, room metrics). */
  readonly takeovers: Int32Array;

  constructor(track: BakedTrack, content: ContentTables, slots: readonly SlotConfig[], seed: number, lookaheadTicks = 0) {
    this.track = track; this.content = content; this.slots = slots; this.seed = seed; this.lookahead = lookaheadTicks;
    const n = slots.length;
    this.lastInput = new Int32Array(n).fill(0);
    this.drivers = new Array<AiDriverEx | null>(n).fill(null);
    this.cruisers = new Array<AiDriverEx | null>(n).fill(null);
    this.active = new Uint8Array(n);
    this.takeovers = new Int32Array(n);
  }

  /** A human input for `slot` arrived at room tick `tick` (hands control back if the AI was driving). */
  noteInput(slot: number, tick: number): void {
    if (slot < 0 || slot >= this.lastInput.length) return;
    this.lastInput[slot] = tick;
    this.active[slot] = 0;
  }

  /** True while the AI drives this human slot. */
  isDriving(slot: number): boolean { return this.active[slot] === 1; }

  /**
   * Call once per tick for every human slot before stepping. Returns true when it wrote the slot's frame
   * into `out` (disconnected or finished); false means use the human's own input.
   */
  drive(w: Readonly<WorldState>, slot: number, out: InputFrame): boolean {
    const k = w.karts[slot];
    if (!k || !k.active) return false;
    if (k.race.finishTick >= 0) {
      const c = this.cruisers[slot] ??= createCruiseDriver(this.track, this.content, slot, this.seed, this.lookahead);
      c.decide(w, out);
      return true;
    }
    if (this.active[slot] === 0) {
      if (w.tick - this.lastInput[slot]! < TAKEOVER_AFTER_TICKS) return false;
      this.active[slot] = 1;
      this.takeovers[slot]!++;
      const d = this.drivers[slot];
      if (d) d.resync();
      else this.drivers[slot] = createTakeoverDriver(this.track, this.content, slot, this.slots[slot]?.characterId, this.seed, this.lookahead);
    }
    this.drivers[slot]!.decide(w, out);
    return true;
  }
}
