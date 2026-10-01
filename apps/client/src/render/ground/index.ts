// Entry point for the ground field used by the High/Ultra systems (clipmap terrain, grass, forest). S-Terrain may move
// the build into a Worker behind this same function; callers only await it.
import { buildGroundField, type GroundField } from './field.ts';

/** The terrain lattice + road distance field of a baked track, or null when it cannot be built. */
export async function loadGroundField(vis: ArrayBuffer): Promise<GroundField | null> {
  try { return buildGroundField(vis); } catch (e) { console.warn('[ground] field build failed:', e); return null; }
}
