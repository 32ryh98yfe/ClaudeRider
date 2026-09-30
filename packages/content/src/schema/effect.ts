import type { EffectId } from '../ids.ts';

/** Where an effect applies. */
export interface EffectApply {
  effect: EffectId;
  to: 'victim' | 'self' | 'team';
  leadTicks?: number;   // Scheduled Conditional Effect lead (default 21). For `to: 'team'` the user's own copy always starts at lead 0.
  durTicks?: number;    // override of EffectDef.durTicks
  param?: number;       // effect-specific parameter
}

export interface EffectMods {
  vTarget?: number;       // absolute target speed override (m/s), e.g. 42.5 for slingshot (boost law)
  vTargetKartBoost?: boolean; // boost law toward the kart's own vBoost (overclock) instead of an absolute vTarget
  vCapMul?: number;       // speed cap as a multiple of V_REF (vT ← min(vT, vCapMul·V_REF)), e.g. 0.5 for stun
  vCapStep?: number;      // stacking effects: cap lowered by this much per extra concurrent stack (throttle 0.08)
  accelMul?: number;
  steerMul?: number;
  steerInvert?: boolean;
  noControl?: boolean;    // throttle/steer/drift ignored
  noItems?: boolean;      // item use refused
  gaugeMul?: number;
  kinematic?: 'airborne' | 'trap' | 'spin' | 'tether' | 'none';
  overlay?: 'redaction' | 'mirror' | 'none';
}

/** Presentation keys consumed by the client (L10 icons/HUD, L11 VFX/SFX). Additive to B7. */
export interface EffectPresentation {
  iconKey: string;        // `effects/<id>` (status icon in the HUD / standings)
  vfxKey: string;         // `effect.<id>` (render/vfx) — continuous while active
  sfxStart?: string;      // one-shot on start (audio/sfx id)
  sfxLoop?: string;       // loop while active
  sfxEnd?: string;        // one-shot on end
  descKey: string;        // `items.effect.<id>.desc`
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
  /** `extend` stacking: remaining duration never exceeds this (turbo 270). */
  capTicks?: number;
  behavior?: string;      // key of sim/src/items/effect-behaviors/<key>.ts
  nameKey: string;
  presentation?: EffectPresentation;
}
