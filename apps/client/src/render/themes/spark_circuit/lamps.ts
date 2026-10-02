// Spark Circuit "lamps on" material for the sunset look: the floodlight masts and the stadium stands' lamp heads are
// one merged vertex-coloured mesh each, so instead of a second prop kind per mast (duplicated rows, shifted scatter
// seeds) the lamp faces are picked out by their vertex colour (C.lamp, warm ivory) and made emissive. Every other
// colour in those props (masts, concrete, crowd cards, ivory, white) misses the key and stays plainly lit.
import * as THREE from 'three/webgpu';
import { step, vertexColor } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';
import { setEmissive } from '../../materials/tsl.ts';

type N = any; // TSL node graphs are dynamically typed (same convention as render/materials)

/**
 * Satin vertex-lit material whose warm-ivory lamp faces glow at `intensity` (≥ 0.8 so the High tier's emissive
 * threshold lets them bloom a little). The key brackets C.lamp '#fff4cf' in both sRGB and linear storage:
 * red ≥ 0.965, green 0.8–0.97, blue 0.5–0.88. White (blue 0.96+), ivory (red < 0.965) and the orange / mustard crowd
 * cards (green < 0.6) all fall outside it.
 */
export function sparkLampLit(intensity = 1.1): THREE.Material {
  return MaterialLibrary.custom(`sparkLampLit:${intensity}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.05 });
    const c: N = vertexColor();
    const key: N = step(0.965, c.r).mul(step(0.8, c.g)).mul(step(c.g, 0.97)).mul(step(0.5, c.b)).mul(step(c.b, 0.88));
    m.colorNode = c;
    setEmissive(m, c.mul(key).mul(intensity));
    return m;
  });
}
