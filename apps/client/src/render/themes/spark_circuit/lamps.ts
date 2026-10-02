// Spark Circuit "lamps on" material for the sunset look: the floodlight masts and the stadium stands' lamp heads are
// one merged vertex-coloured mesh each, so instead of a second prop kind per mast (duplicated rows, shifted scatter
// seeds) the lamp faces are picked out by their vertex colour (C.lamp, warm ivory) and made emissive. Every other
// colour in those props (masts, concrete, crowd cards, ivory, white) misses the key and stays plainly lit.
// sparkSignLit applies the same trick to the coral sparkle on the gantry and the race-control tower, in every look.
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

/**
 * Satin vertex-lit material (the kit's `satin` slot: roughness 0.7) for the props that carry the coral parametric
 * sparkle (start gantry, race-control tower). Lit coral went muddy brown wherever the mark sat in shade, so the coral
 * faces are half albedo and half self-lit: they read coral in sun and shade alike. The glow stays below the High
 * tier's 0.8 emissive threshold (coral · 0.55 is at most 0.47 in any channel), so the mark never blooms.
 * The key brackets C.coral '#d97757' in both sRGB (0.85, 0.47, 0.34) and linear (0.69, 0.18, 0.10) storage:
 * red 0.6–0.9, green 0.14–0.52, blue 0.06–0.40 and green above 1.2 × blue. The kerb reds (green < 0.25 and below
 * blue), the navy, white, ivory, glass and graphite parts all fall outside it.
 */
export function sparkSignLit(glow = 0.55): THREE.Material {
  return MaterialLibrary.custom(`sparkSignLit:${glow}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0 });
    const c: N = vertexColor();
    const key: N = step(0.6, c.r).mul(step(c.r, 0.9)).mul(step(0.14, c.g)).mul(step(c.g, 0.52))
      .mul(step(0.06, c.b)).mul(step(c.b, 0.4)).mul(step(c.b.mul(1.2), c.g));
    m.colorNode = c.mul(key.mul(-0.4).add(1));
    setEmissive(m, c.mul(key).mul(glow));
    return m;
  });
}
