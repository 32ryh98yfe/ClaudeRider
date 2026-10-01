// Terrain surface function shared by the baked terrain material and the clipmap (33-ultra-graphics §5, S-Mat owns the
// full layered version). Inputs are explicit nodes instead of positionWorld/normalWorld because the clipmap computes
// its own world position and normal from the height texture in the vertex/fragment stage.
import { color, mix, smoothstep, clamp, float, vec3 } from 'three/tsl';
import { n01 } from './tsl.ts';

type N = any;

export interface TerrainSurfaceParams { a: string; b: string; rock: string }
export interface TerrainSurfaceNodes {
  /** Linear albedo (before the baked shade). */
  color: N;
  roughness: N;
  /** World-space perturbed normal, or null to keep the input normal. */
  normal: N | null;
}

/**
 * Albedo/roughness for a terrain point. `posW` world position (vec3), `nrmW` world normal (vec3, unit),
 * `shade` the baked noise × AO (float, 0..1), `roadDist` metres to the nearest drivable surface (float).
 * Stub: the current Medium/High terrain look without the screen-space bump.
 */
export function terrainSurface(p: TerrainSurfaceParams, posW: N, nrmW: N, shade: N, _roadDist: N): TerrainSurfaceNodes {
  const n1 = n01(posW.xz.mul(0.018)), n2 = n01(posW.xz.mul(0.21));
  const slope = clamp(float(1).sub(nrmW.y).mul(3.2), 0, 1);
  let grass: N = mix(color(p.a), color(p.b), n1.mul(0.7).add(n2.mul(0.3)));
  const dry = smoothstep(0.62, 0.8, n01(posW.xz.mul(0.035).add(9.1)));
  grass = mix(grass, grass.mul(vec3(1.18, 1.08, 0.72)), dry.mul(0.55));
  const rockC: N = color(p.rock).mul(n2.mul(0.25).add(0.85));
  return { color: mix(grass, rockC, slope).mul(shade), roughness: mix(float(0.96), float(0.85), slope), normal: null };
}
