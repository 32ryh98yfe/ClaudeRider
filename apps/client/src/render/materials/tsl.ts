// Shared TSL building blocks for the MaterialLibrary: noise, procedural bump, Fresnel, wind, grids.
// Only render/materials may create shared materials; other systems import these helpers when they build
// their node graphs through the library.
import {
  float, vec2, vec3, vec4, uniform, mx_noise_float, mx_worley_noise_float, positionView, normalView, faceDirection,
  normalWorld, positionViewDirection, dot, max, pow, fract, abs, smoothstep, min, mix, floor, sin, time, clamp, Fn,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

type N = any; // TSL node graphs are dynamically typed; the r186 typings model them loosely.

/** Node materials all honour `emissiveNode` (NodeMaterial.setupLighting); the typings only declare it on lit ones. */
export function setEmissive(m: object, node: N): void { (m as { emissiveNode: N }).emissiveNode = node; }

/** Global look uniforms shared by every library material (set per theme by the environment). */
export const fxUniforms = {
  /** Multiplier on the Fresnel rim of vinyl mascots and kart paint (stronger at night for readability). */
  rimBoost: uniform(1),
  /** Wind strength for foliage (0 = still). */
  wind: uniform(1),
  /** Wetness 0..1 (rain themes): darkens albedo, lowers roughness. */
  wet: uniform(0),
  /** Scroll speed multiplier for pads / neon. */
  pulse: uniform(1),
};

// Noise quality: MaterialX Perlin on Medium+; on Low a compact value noise emitted once per shader as a GLSL
// function. Shader size dominates compile/link time (SwiftShader spends seconds per Perlin-heavy program).
let hqNoise = true;
export function setNoiseQuality(hq: boolean): void { hqNoise = hq; }

const hash3 = Fn(([p]: [N]) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453)))
  .setLayout({ name: 'crHash3', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] }) as unknown as (p: N) => N;
/** Trilinear value noise 0..1 (vec2 inputs are padded with z = 0). */
export const vnoise = Fn(([p]: [N]) => {
  const i: N = floor(p), f: N = fract(p);
  const u: N = f.mul(f).mul(f.mul(-2).add(3));
  const a = mix(hash3(i), hash3(i.add(vec3(1, 0, 0))), u.x), b = mix(hash3(i.add(vec3(0, 1, 0))), hash3(i.add(vec3(1, 1, 0))), u.x);
  const c = mix(hash3(i.add(vec3(0, 0, 1))), hash3(i.add(vec3(1, 0, 1))), u.x), d = mix(hash3(i.add(vec3(0, 1, 1))), hash3(i.add(vec3(1, 1, 1))), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}).setLayout({ name: 'crValueNoise', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] }) as unknown as (p: N) => N;

/** Noise remapped to 0..1 (Perlin on Medium+, value noise on Low). */
export const n01 = (p: N): N => (hqNoise ? mx_noise_float(p).mul(0.5).add(0.5) : vnoise(p));

/** Two-octave value noise, 0..1 (cheaper than mx_fractal_noise_float with 3+ octaves). */
export const fbm2 = (p: N): N => n01(p).mul(0.65).add(n01(p.mul(2.13).add(17.3)).mul(0.35));

/** Cellular edges (0 at cell borders → 1 inside), for cracks, stones and scales. */
export const cellEdges = (p: N, width: number): N => {
  if (!hqNoise) {
    // Low: distance to one jittered point per cell (no neighbour search) — blockier, a fraction of the code
    const q = vec3(p), c = floor(q), j = vec3(hash3(c), hash3(c.add(7.7)), hash3(c.add(3.1))).mul(0.6).add(0.2);
    return smoothstep(0, width, fract(q).sub(j).length().mul(0.9));
  }
  const d = mx_worley_noise_float(p);
  return smoothstep(0, width, d);
};

/** Schlick-style Fresnel term in view space. */
export const fresnel = (power: number): N => pow(float(1).sub(max(dot(normalView, positionViewDirection), 0)), power);

/**
 * Procedural bump: perturbs the view normal by the screen-space gradient of a height node
 * (Mikkelsen, "Bump Mapping Unparametrized Surfaces on the GPU"). Works with any float node, unlike
 * BumpMapNode which needs a texture.
 */
export const proceduralBump = Fn(([height, scale]: [N, N]) => {
  const dHdx = height.dFdx().mul(scale), dHdy = height.dFdy().mul(scale);
  const sx = positionView.dFdx().normalize(), sy = positionView.dFdy().normalize();
  const nrm = normalView;
  const r1 = sy.cross(nrm), r2 = nrm.cross(sx);
  const det = sx.dot(r1).mul(faceDirection);
  const grad = det.sign().mul(dHdx.mul(r1).add(dHdy.mul(r2)));
  return det.abs().mul(nrm).sub(grad).normalize();
}) as unknown as (h: N, s: N) => N;

/** Anti-aliased line mask: 1 on lines of `width` (in cells) at integer positions of `x`. */
export const aaLines = (x: N, width: number): N => {
  const f = abs(fract(x.add(0.5)).sub(0.5));
  const w = x.fwidth().mul(1.2).add(width);
  return float(1).sub(smoothstep(width, w, f));
};

/** Distance fade for high-frequency detail (1 near → 0 far), avoids shimmering. */
export const detailFade = (near: number, far: number): N => float(1).sub(smoothstep(near, far, positionView.z.negate()));

/** Wind sway offset for vertex nodes: `mask` scales amplitude (0 at the root). */
export const windOffset = (phase: N, mask: N, amp = 0.08): N => {
  const t = time.mul(1.6).add(phase);
  const s = sin(t).add(sin(t.mul(2.3).add(1.7)).mul(0.35));
  return vec3(s.mul(amp), 0, sin(t.mul(0.8).add(0.5)).mul(amp * 0.6)).mul(mask).mul(fxUniforms.wind);
};

/** Slope 0 (flat) → 1 (vertical) from the world normal. */
export const slope01 = (): N => clamp(float(1).sub(normalWorld.y), 0, 1);

/** Simple scrolling chevrons along v (for pads / arrows): 1 on the chevron band. */
export const chevrons = (u: N, v: N, freq: number, speed: number, sharp = 0.55): N => {
  const c = fract(v.mul(freq).sub(time.mul(speed).mul(fxUniforms.pulse)).add(abs(u.sub(0.5)).mul(1.6)));
  return smoothstep(sharp - 0.04, sharp + 0.04, c);
};

/** Stable per-cell random in 0..1 from a 2D integer cell. */
export const cellRand = (cell: N): N => fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453));

export { vec4, min, mix, floor };
export type { Node };
