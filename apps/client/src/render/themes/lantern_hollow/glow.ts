// Lit vertex-colour material whose channels above 1 also glow (stylized pass, 2026-10). Lantern Hollow, Ember Mine
// and Coral Cove paint their lamp paper, lit windows, pumpkin faces and lava seams with HDR vertex colours (`hdr`,
// `glow`); with the plain vertex-lit material those parts only read as brighter albedo, so at night a lantern was as
// dark as the post holding it. Here the albedo is clamped to 1 and max(c − 1, 0) × gain becomes emissive: the lit
// parts feed the emissive MRT (bloom on High above its 0.8 threshold) while wood, stone and straw stay matte.
// Theme-local material through MaterialLibrary.custom (one per roughness/gain pair, counted in the scene budget).
import * as THREE from 'three/webgpu';
import { max, min, vec3, vec4, vertexColor } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';

export function glowLit(roughness = 0.8, gain = 1.4): THREE.Material {
  return MaterialLibrary.custom(`vglow:${roughness}:${gain}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0 });
    const c = vertexColor().rgb;
    m.colorNode = vec4(min(c, vec3(1)), 1);
    m.emissiveNode = max(c.sub(vec3(1)), vec3(0)).mul(gain);
    return m;
  });
}
