// Character-side materials (ADR-011, 30-art-bible §2): vinyl mascots, candy kart paint, emissive/neon.
import * as THREE from 'three/webgpu';
import { color, float, vec3, vertexColor, positionWorld, time, sin, mix, uniform, smoothstep } from 'three/tsl';
import { fresnel, fxUniforms, n01, setEmissive } from './tsl.ts';

type N = any;

export interface VinylParams { rim?: string; clearcoat?: number; roughness?: number; tint?: THREE.Color | null; metalness?: number }

/** Vinyl-toy mascot material: vertex-coloured palette, clearcoat, sheen, warm Fresnel rim (TSL, no onBeforeCompile). */
export function buildVinyl(p: VinylParams): THREE.MeshPhysicalNodeMaterial {
  const m = new THREE.MeshPhysicalNodeMaterial({
    roughness: p.roughness ?? 0.42, metalness: p.metalness ?? 0, clearcoat: p.clearcoat ?? 0.6, clearcoatRoughness: 0.25,
    sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffe9de'),
  });
  const base: N = p.tint ? vertexColor().mul(color(p.tint)) : vertexColor();
  m.colorNode = base;
  // rim (power 2.5) plus a faint body-colour lift so the shadow side never goes dead in dark themes
  m.emissiveNode = color(p.rim ?? '#ffd9c7').mul(fresnel(2.5)).mul(float(0.38).mul(fxUniforms.rimBoost)).add(base.mul(0.035));
  return m;
}

/** Candy kart paint: vertex-coloured livery, clearcoat 1.0 / 0.1, metallic flake, white Fresnel rim. */
export function buildKartPaint(hq: boolean, map: THREE.Texture | null): THREE.MeshPhysicalNodeMaterial {
  const m = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.34, metalness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  if (map) m.map = map; // livery canvas texture (L8); otherwise the livery lives in vertex colours
  else m.colorNode = vertexColor();
  if (hq) {
    // metallic flake: tiny roughness/metalness variation that sparkles under the sun and PMREM
    const flake = n01(positionWorld.mul(120));
    m.roughnessNode = float(0.3).add(flake.mul(0.12));
    m.metalnessNode = float(0.14).add(flake.mul(0.12));
  }
  m.emissiveNode = color('#ffffff').mul(fresnel(3)).mul(float(0.12).mul(fxUniforms.rimBoost));
  return m;
}

/** Unlit emissive: shows `c` and writes `c · intensity` to the emissive MRT (bloom). */
export function buildEmissive(c: string, intensity: number): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = color(c);
  setEmissive(m, color(c).mul(intensity));
  return m;
}

/** Vertex-coloured emissive (glyphs, LEDs, hologram strips): brightness = vertex colour · intensity. */
export function buildEmissiveVertex(intensity: number): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = vertexColor();
  setEmissive(m, vertexColor().mul(intensity));
  return m;
}

/** Neon tube / sign: emissive with a slow breathing pulse and an optional flicker (original sign art only). */
export function buildNeon(c: string, intensity: number, flicker: number): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const ph = n01(positionWorld.mul(0.05)).mul(6.283);
  const breathe = sin(time.mul(1.3).add(ph)).mul(0.12).add(0.95);
  const fl = flicker > 0 ? mix(float(1), smoothstep(0.08, 0.1, n01(vec3(time.mul(9), ph, 0))), float(flicker)) : float(1);
  m.colorNode = color(c).mul(0.6);
  setEmissive(m, color(c).mul(intensity).mul(breathe).mul(fl));
  return m;
}

/** Plain vertex-colour lit material (props, wheels, mechanical parts). */
export function buildVertexLit(roughness: number, metalness: number): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness });
  m.colorNode = vertexColor();
  return m;
}

export const boostUniform = uniform(0);
