// FROZEN (contracts.lock). Step context, authority hooks and per-kart effect modifiers.
import type { ContentTables, RankBucket } from '@cr/content';
import type { BakedTrack, Contact, FrameSample, GroundHit, GravityOut, AiSample } from './track/BakedTrack.ts';
import type { EventSink } from './core/events.ts';
import type { Decision, RaceConfig, TrackLoc } from './core/state.ts';
import type { Tick } from './core/units.ts';

export interface AuthorityHooks {
  /** Keyed-hash item roll (HalfSipHash-2-4 over a secret key). Returns an item code. */
  rollItem(slot: number, boxId: number, tick: Tick, bucket: RankBucket): number;
  /** Records an authoritative decision (appended to world.decisions and broadcast). */
  emit(d: Decision): void;
}

/** Aggregated modifiers from active effects, recomputed every tick by the items runtime. */
export interface KartMods {
  vCapMul: number;        // multiplies the speed cap
  vTarget: number;        // >0: absolute boost target speed (turbo, overclock)
  accelMul: number;
  steerMul: number;
  steerInvert: boolean;
  noControl: boolean;
  noItems: boolean;
  gaugeMul: number;
  kinematic: 0 | 1 | 2 | 3 | 4; // none, airborne, trap, spin, tether
}

export const neutralMods = (m: KartMods): KartMods => {
  m.vCapMul = 1; m.vTarget = 0; m.accelMul = 1; m.steerMul = 1; m.steerInvert = false; m.noControl = false; m.noItems = false; m.gaugeMul = 1; m.kinematic = 0;
  return m;
};

export interface StepScratch {
  contacts: Contact[];
  hit: GroundHit;
  frame: FrameSample;
  frame2: FrameSample;
  grav: GravityOut;
  ai: AiSample;
  loc: TrackLoc;
  mods: KartMods[];
}

export interface StepContext {
  readonly track: BakedTrack;
  readonly cfg: RaceConfig;
  readonly content: ContentTables;
  readonly role: 'authority' | 'predictor';
  readonly authority?: AuthorityHooks;
  readonly events: EventSink;
  readonly scratch: StepScratch;
}

export function makeScratch(): StepScratch {
  const frame = (): FrameSample => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 });
  return {
    contacts: Array.from({ length: 12 }, () => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0, flags: 0, tri: 0 })),
    hit: { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 },
    frame: frame(), frame2: frame(),
    grav: { x: 0, y: -28, z: 0, scale: 1 },
    ai: { lineU: 0, vLim: 99, kappa: 0, turnAhead40: 0, driftZone: 0, width: 12 },
    loc: { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 },
    mods: Array.from({ length: 8 }, () => neutralMods({} as KartMods)),
  };
}

export function makeContext(o: { track: BakedTrack; cfg: RaceConfig; content: ContentTables; role: 'authority' | 'predictor'; authority?: AuthorityHooks; events: EventSink }): StepContext {
  return { ...o, scratch: makeScratch() };
}
