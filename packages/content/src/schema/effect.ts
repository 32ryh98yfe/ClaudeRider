import type { EffectId } from '../ids.ts';

/** Where an effect applies. */
export interface EffectApply {
  effect: EffectId;
  to: 'victim' | 'self' | 'team';
  leadTicks?: number;   // Scheduled Conditional Effect lead (default 21)
  durTicks?: number;    // override of EffectDef.durTicks
  param?: number;       // effect-specific parameter
}

export interface EffectMods {
  vTarget?: number;       // absolute target speed override (m/s), e.g. 44.4 for turbo
  vCapMul?: number;       // multiplier on the kart's speed cap (×V)
  accelMul?: number;
  steerMul?: number;
  steerInvert?: boolean;
  noControl?: boolean;    // throttle/steer/drift ignored
  noItems?: boolean;      // item use refused
  gaugeMul?: number;
  kinematic?: 'airborne' | 'trap' | 'spin' | 'tether' | 'none';
  overlay?: 'redaction' | 'mirror' | 'none';
}

export interface EffectDef {
  id: EffectId;
  code: number;
  class: 'hardCC' | 'softCC' | 'buff' | 'defense';
  durTicks: number;
  stacking: 'refresh' | 'stackDuration3' | 'extend' | 'none';
  immunityAfterTicks: number;
  mods: EffectMods;
  mash?: { creditTicks: number; floorTicks: number; maxCredits: number; minGapTicks: number };
  onEnd?: EffectApply[];
  behavior?: string;      // key of sim/src/items/effect-behaviors/<key>.ts
  nameKey: string;
}
