// Terrain with softened baked AO for bright ground (sand, snow). The .vis bakes per-vertex AO into the terrain colour;
// on the noise hills a single self-occluded vertex shows as a dark diamond (Gouraud over the grid), which bright
// sand and snow make far more visible than grass. This variant divides the baked AO back out and re-applies only part
// of it, so wall bases and gullies keep some shade while the open ground reads as clean, matte colour (34 §1.3).
// Shared by the Sunstone Desert and Frostbyte Glacier kits; built through MaterialLibrary.custom (one material each).
import * as THREE from 'three/webgpu';
import { vertexColor, mix, vec3, max } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';

type N = any;

/** `keep` = share of the baked AO darkening that stays (0 = none, 1 = the library terrain as is). */
export function softAoTerrain(a: string, b: string, rock: string, keep = 0.4): THREE.Material {
  const base = MaterialLibrary.terrain(a, b, rock);
  // the library key carries the quality profile, so each tier gets its own variant
  return MaterialLibrary.custom(`terrainSoftAo:${base.name}:${keep}`, () => {
    const m = base.clone();
    const vc: N = vertexColor().rgb;
    m.colorNode = (base.colorNode as N).rgb.div(max(vc, vec3(0.05))).mul(mix(vec3(1), vc, keep));
    return m;
  });
}
