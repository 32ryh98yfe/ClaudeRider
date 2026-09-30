import type { SurfaceDef } from './schema/index.ts';
import { SURFACE_IDS, codeOf } from './ids.ts';
import type { SurfaceId } from './ids.ts';

// grip: lateral grip multiplier; vMul: top-speed multiplier; dragMul: coast drag multiplier (10-sim-spec §13.1).
const S = (id: SurfaceId, grip: number, vMul: number, dragMul = 1, extra: Partial<SurfaceDef> = {}): SurfaceDef =>
  ({ id, code: codeOf(SURFACE_IDS, id), grip, vMul, dragMul, ...extra });

export const SURFACES: readonly SurfaceDef[] = [
  S('asphalt', 1.0, 1.0), S('stone', 1.0, 1.0), S('cobble', 0.98, 1.0), S('dirt', 0.92, 0.97, 1.2), S('sand', 0.85, 0.92, 1.6),
  S('gravel', 0.85, 0.94, 1.4), S('ice', 0.75, 1.0, 0.8), S('snow', 0.9, 0.95, 1.2), S('grass', 0.8, 0.6, 2.2), S('wet', 0.92, 1.0),
  S('wood', 0.98, 1.0), S('metal', 0.97, 1.0), S('boost_pad', 1.0, 1.0), S('jump_pad', 1.0, 1.0),
  S('conveyor_fwd', 1.0, 1.0, 1, { conveyor: 1.15 }), S('conveyor_back', 1.0, 1.0, 1, { conveyor: 0.85 }),
  S('lava', 1.0, 1.0, 1, { kill: true }), S('basalt', 0.97, 1.0), S('obsidian', 0.95, 1.0), S('glass', 0.96, 1.0), S('rail', 1.0, 1.0),
];
/** Lookup by wire code (index = code). */
export const SURFACE_BY_CODE: readonly (SurfaceDef | undefined)[] = [undefined, ...SURFACES];

/**
 * Renderer and audio hints per surface (cosmetic; the sim never reads them). `particle` picks the wheel and drift
 * emitter, `color` tints it (hex), `skid` is the skid-mark opacity 0..1, `rumble` the camera/pad rumble 0..1 and
 * `sfx` the rolling-noise loop key.
 */
export type SurfaceParticle = 'smoke' | 'dust' | 'sand' | 'gravel' | 'snow' | 'spray' | 'frost' | 'grass' | 'splinter' | 'sparks' | 'embers' | 'none';
export interface SurfaceFx { particle: SurfaceParticle; color: string; skid: number; rumble: number; sfx: string }

const FX = (particle: SurfaceParticle, color: string, skid: number, rumble: number, sfx: string): SurfaceFx => ({ particle, color, skid, rumble, sfx });

export const SURFACE_FX: Readonly<Record<SurfaceId, SurfaceFx>> = {
  asphalt: FX('smoke', '#d9d6d0', 0.9, 0.0, 'roll.asphalt'),
  stone: FX('smoke', '#cfc8bd', 0.8, 0.05, 'roll.asphalt'),
  cobble: FX('dust', '#b9ab95', 0.6, 0.25, 'roll.cobble'),
  dirt: FX('dust', '#9a7652', 0.4, 0.3, 'roll.dirt'),
  sand: FX('sand', '#e2c98f', 0.3, 0.35, 'roll.sand'),
  gravel: FX('gravel', '#a39a8c', 0.3, 0.45, 'roll.gravel'),
  ice: FX('frost', '#dff4ff', 0.2, 0.05, 'roll.ice'),
  snow: FX('snow', '#f5f9ff', 0.5, 0.2, 'roll.snow'),
  grass: FX('grass', '#6f9a47', 0.3, 0.5, 'roll.grass'),
  wet: FX('spray', '#c9d6e0', 0.5, 0.05, 'roll.wet'),
  wood: FX('splinter', '#b8864f', 0.6, 0.2, 'roll.wood'),
  metal: FX('sparks', '#ffd27a', 0.7, 0.15, 'roll.metal'),
  boost_pad: FX('none', '#39e6a8', 0.0, 0.0, 'roll.asphalt'),
  jump_pad: FX('none', '#ff7a8a', 0.0, 0.0, 'roll.asphalt'),
  conveyor_fwd: FX('none', '#7ad0ff', 0.2, 0.15, 'roll.metal'),
  conveyor_back: FX('none', '#ff9f6a', 0.2, 0.15, 'roll.metal'),
  lava: FX('embers', '#ff6a1f', 0.0, 0.6, 'roll.lava'),
  basalt: FX('dust', '#5a5552', 0.7, 0.1, 'roll.asphalt'),
  obsidian: FX('smoke', '#2e2838', 0.8, 0.05, 'roll.asphalt'),
  glass: FX('smoke', '#bfe8ff', 0.8, 0.0, 'roll.glass'),
  rail: FX('sparks', '#ffe39a', 0.0, 0.1, 'roll.rail'),
};

/** Hints for a surface wire code (asphalt for 0 or unknown codes, so a missing entry never crashes the renderer). */
export function surfaceFx(code: number): SurfaceFx {
  const id = SURFACE_IDS[code - 1];
  return (id && SURFACE_FX[id]) || SURFACE_FX.asphalt;
}
