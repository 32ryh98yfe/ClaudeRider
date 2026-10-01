// Lit bodies with self-lit accents in one draw, shared by the Neon Harbor and Orbital Nexus prop kits.
// Every part of a prop is tagged with a per-vertex `glow` gain: 0 is an ordinary lit, matte surface (concrete,
// painted metal, fabric) that the moon, the sky fill and the back fill shade, so street furniture keeps its form at
// night; > 0 is a light (window, neon tube, lamp lens) whose colour × gain goes to the emissive buffer and is not lit.
// Gains below ≈ 1 stay under the High bloom threshold (0.8 on the emissive buffer): lit windows and screens read
// without haloing, and only real lamps and neon tubes (gain ≥ 1.6) bloom (34-stylized-pass §1.3).
import * as THREE from 'three/webgpu';
import { attribute, vertexColor, step, float } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';
import { setEmissive } from '../../materials/tsl.ts';
import { merge } from '../../util/geo.ts';

/** The shared lit-plus-glow material (one per roughness/metalness pair, so at most two or three per scene). */
export function glowLit(roughness = 0.8, metalness = 0): THREE.Material {
  return MaterialLibrary.custom(`glowLit:${roughness}:${metalness}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness });
    const g = attribute('glow', 'float');
    // lights carry no albedo, so the key light never washes a lit window to grey
    m.colorNode = vertexColor().mul(float(1).sub(step(0.001, g)));
    setEmissive(m, vertexColor().rgb.mul(g));
    return m;
  });
}

/** Collects painted parts with their glow gain and merges them (all parts must come from `paint`). */
export class GlowParts {
  readonly list: THREE.BufferGeometry[] = [];
  /** A lit (non-glowing) part. */
  add(...g: THREE.BufferGeometry[]): this { for (const x of g) this.list.push(tag(x, 0)); return this; }
  /** A light: emissive colour × `gain`. */
  light(gain: number, ...g: THREE.BufferGeometry[]): this { for (const x of g) this.list.push(tag(x, gain)); return this; }
  build(): THREE.BufferGeometry { return merge(this.list); }
}

function tag(g: THREE.BufferGeometry, gain: number): THREE.BufferGeometry {
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count).fill(gain), 1));
  return g;
}
