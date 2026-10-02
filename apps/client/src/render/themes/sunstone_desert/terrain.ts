// Terrain with softened baked AO for bright ground (sand, snow). The .vis bakes per-vertex AO into the terrain colour,
// tuned on grass; on near-white sand and snow the same darkening reads as grey blotches over the noise hills. This
// variant divides the baked AO back out and re-applies only part of it, so wall bases and gullies keep their shade
// while the open ground reads as clean, matte colour (34 §1.3). Shared by the Sunstone Desert and Frostbyte Glacier
// kits; built through MaterialLibrary.custom (one material per kit and tier).
import * as THREE from 'three/webgpu';
import { vertexColor, mix, vec3, max, clamp, color, positionWorld } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';
import { n01, slope01 } from '../../materials/tsl.ts';

type N = any;

/**
 * `keep` = share of the baked AO darkening that stays (0 = none, 1 = the library terrain as is). `calm` replaces the
 * library colour with broad tones only: its rock noise is projected on world xz, so on tall cliffs it stretches into
 * vertical smears, and its fine grain and dry patches read as dirty streaks on snow under a strong night sky fill.
 * Calm snow keeps only the 55 m tone drift; calm rock uses a low-frequency 3D noise (no stretching on cliffs).
 */
export function softAoTerrain(a: string, b: string, rock: string, keep = 0.4, calm = false): THREE.Material {
  const base = MaterialLibrary.terrain(a, b, rock);
  // the library key carries the quality profile, so each tier gets its own variant
  return MaterialLibrary.custom(`terrainSoftAo:${base.name}:${keep}${calm ? ':calm' : ''}`, () => {
    const m = base.clone();
    const vc: N = vertexColor().rgb;
    const ao: N = mix(vec3(1), vc, keep);
    if (!calm) {
      m.colorNode = (base.colorNode as N).rgb.div(max(vc, vec3(0.05))).mul(ao);
      return m;
    }
    const P: N = positionWorld;
    const ground: N = mix(color(a), color(b), n01(P.xz.mul(0.018)));
    const rockC: N = color(rock).mul(n01(P.mul(0.06)).mul(0.16).add(0.9));
    m.colorNode = mix(ground, rockC, clamp(slope01().mul(3.2), 0, 1)).mul(ao);
    return m;
  });
}
