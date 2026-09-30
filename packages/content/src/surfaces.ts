import type { SurfaceDef } from './schema/index.ts';
import { SURFACE_IDS, codeOf } from './ids.ts';
import type { SurfaceId } from './ids.ts';

// grip: lateral grip multiplier; vMul: top-speed multiplier; dragMul: coast drag multiplier (ADR-006 surface table).
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
