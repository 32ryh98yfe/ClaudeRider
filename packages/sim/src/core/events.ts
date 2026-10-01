// FROZEN (contracts.lock). Cosmetic one-shot events emitted by step(). Never read back by the sim.
import type { BoostKind, EffectResult } from './state.ts';
import type { Tick } from './units.ts';

export type SimEventBody =
  | { t: 'countdown'; n: 3 | 2 | 1 | 0 }
  | { t: 'startBoost'; kart: number; tier: 'perfect' | 'great' | 'good' | 'false' | 'none' }
  | { t: 'driftStart' | 'driftEnd' | 'doubleDrift' | 'instantBoost' | 'gaugeFull' | 'finalLap' | 'retire' | 'draftReady'; kart: number }
  | { t: 'boostStart' | 'boostEnd'; kart: number; kind: BoostKind }
  | { t: 'teamGaugeFull'; team: number }
  | { t: 'draft'; kart: number; on: boolean }
  | { t: 'drag'; kart: number; on: boolean }                 // drag state (끌기) entered / left
  | { t: 'tapBoost'; kart: number; streak: number }          // valid tap (톡톡이), streak 1..3
  | { t: 'cut' | 'brakeTurn' | 'spinOut'; kart: number }    // cutting, brake drift turn (고속턴), spin-out
  | { t: 'gear'; kart: number; gear: 0 | 1 | 2 | 3 }         // Gear.STOP / D / N / R
  | { t: 'wall'; kart: number; severity: 0 | 1 | 2; x: number; y: number; z: number; speed: number }
  | { t: 'bump'; a: number; b: number; impulse: number }
  | { t: 'air' | 'land'; kart: number; impact: number }
  | { t: 'box'; kart: number; boxId: number }
  | { t: 'itemGranted'; kart: number; item: number }
  | { t: 'itemUse' | 'itemFizzle'; kart: number; item: number; obj: number }
  | { t: 'projSpawn' | 'projImpact'; obj: number; item: number }
  | { t: 'hazardSpawn' | 'hazardRemove'; obj: number; item: number }
  | { t: 'effect'; victim: number; effect: number; source: number; result: EffectResult }
  | { t: 'effectEnd'; victim: number; effect: number }
  | { t: 'mash'; kart: number; remaining: number }
  | { t: 'escape'; kart: number; effect: number; fast: boolean; credits: number } // L2: a mash-out trap ended ("빠른 탈출!" when fast)
  | { t: 'lap'; kart: number; lap: number; lapTicks: number; best: boolean }
  | { t: 'finish'; kart: number; rank: number; raceTicks: number; frac: number }
  | { t: 'retireTimer'; endsTick: Tick }
  | { t: 'wrongWay'; kart: number; on: boolean }
  | { t: 'respawn'; kart: number; phase: 'out' | 'in' }
  | { t: 'rank'; kart: number; from: number; to: number }
  | { t: 'emote'; kart: number; emote: number }
  | { t: 'raceEnd' };

export type SimEvent = SimEventBody & { tick: Tick; key: number };

export interface EventSink { push(e: SimEvent): void }

export const NULL_SINK: EventSink = { push(): void { /* discard */ } };

/** Collects events into an array (tests, authority). */
export class ArraySink implements EventSink {
  readonly list: SimEvent[] = [];
  push(e: SimEvent): void { this.list.push(e); }
  drain(out: SimEvent[]): void { for (const e of this.list) out.push(e); this.list.length = 0; }
}
