// Mascot and kart materials promoted from L8 (docs/design/contract-requests/L8-portraits.md §4). One material each
// serves every mascot / kart in the scene; per-character and per-livery variation lives in vertex attributes:
//   color (palette), surf (roughness, metalness, glow, clearcoat), pcol + pat (livery), eyeFx (glow, LED flag).
// Medium+ builds match L8's originals (physical BRDF, clearcoat, sheen, MaterialX Perlin). Low uses the standard BRDF
// and value noise: the physical kart shader was the single most expensive program to link on SwiftShader (≈13 s).
import * as THREE from 'three/webgpu';
import {
  attribute, vertexColor, float, vec2, vec3, vec4, max, mix, smoothstep, step, fract, floor, abs, mod, sin, texture, uv, clamp,
  positionGeometry, mx_noise_float, select, length, color, output,
} from 'three/tsl';
import { fresnel, fxUniforms, vnoise } from './tsl.ts';

type N = any;

/**
 * Low: ignore `scene.environment`. PMREM sampling (cube-UV face selection, mip blending) roughly doubles these
 * skinned shaders, and each one then links for seconds on SwiftShader. Hemisphere light still fills the shadow side.
 */
function lowEnv<T extends THREE.Material>(m: T, hq: boolean): T {
  if (!hq) (m as unknown as { setupEnvironment: () => null }).setupEnvironment = () => null;
  return m;
}

/** Signed noise −1..1: Perlin on Medium+, value noise on Low. */
const snoise = (p: N, hq: boolean): N => (hq ? mx_noise_float(p) : vnoise(p).mul(2).sub(1));

/** Vinyl-toy mascot body: clearcoat + sheen (Medium+), warm Fresnel rim #FFD9C7 (weaker on metals). */
export function buildMascotVinyl(hq: boolean): THREE.MeshStandardNodeMaterial {
  const m: N = hq
    ? new THREE.MeshPhysicalNodeMaterial({ clearcoatRoughness: 0.25, sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff1e8') })
    : new THREE.MeshStandardNodeMaterial();
  const s: N = attribute('surf', 'vec4');
  const base: N = vertexColor().rgb;
  m.colorNode = base;
  // Low has no clearcoat lobe, so the base is a touch glossier to keep the toy sheen
  m.roughnessNode = hq ? s.x : s.x.mul(0.85);
  m.metalnessNode = s.y;
  if (hq) m.clearcoatNode = s.w;
  // metals keep a cooler, weaker rim so copper reads as metal rather than plastic; rimBoost lifts it at night
  const rim = color('#ffd9c7').mul(fresnel(2.5)).mul(float(0.36).mul(float(1).sub(s.y.mul(0.55)))).mul(fxUniforms.rimBoost);
  m.emissiveNode = base.mul(s.z).add(rim);
  return lowEnv(m, hq);
}

/** Transparent glass (helmets, shards, visors): Fresnel-weighted opacity. */
export function buildMascotGlass(hq: boolean): THREE.MeshStandardNodeMaterial {
  const m: N = hq
    ? new THREE.MeshPhysicalNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 })
    : new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.05, metalness: 0 });
  const s: N = attribute('surf', 'vec4');
  const base: N = vertexColor().rgb;
  const fres = fresnel(2.0);
  m.colorNode = base;
  m.roughnessNode = s.x;
  m.opacityNode = mix(float(0.05), float(0.78), fres).add(s.z.mul(0.15)).clamp(0, 1);
  m.emissiveNode = base.mul(s.z).add(vec3(1, 1, 1).mul(fres.mul(0.22)));
  return lowEnv(m, hq);
}

/** Eye decals: alpha-tested atlas (opaque pass, so they compose under glass), LED dot-matrix flag, glint. */
export function buildMascotEyes(atlas: THREE.Texture, cells: { cols: number; rows: number }, hq = true): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.18, metalness: 0, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const t: N = texture(atlas, uv());
  const fx: N = attribute('eyeFx', 'vec2');
  const shape = t.r, glint = t.g;
  // LED screens: round dot matrix, 12 × 16 dots per cell
  const grid: N = fract(uv().mul(vec2(cells.cols * 12, cells.rows * 16))).sub(0.5);
  const dotM = smoothstep(0.5, 0.32, grid.length());
  const led = mix(float(1), dotM, fx.y);
  const base: N = vertexColor().rgb;
  const gl = glint.mul(float(1).sub(fx.y));
  m.colorNode = mix(base, vec3(1, 1, 1), gl);
  m.opacityNode = max(shape.mul(led), gl);
  m.emissiveNode = base.mul(fx.x).mul(shape).add(vec3(1, 1, 1).mul(gl.mul(0.35)));
  return lowEnv(m, hq);
}

/**
 * Candy kart paint with the 12 livery patterns evaluated from the bind-pose position (a livery change rewrites
 * attributes only). pat = 0 unpainted, else pattern id + 1 + param/2 (param = the kart's split height).
 */
export function buildKartLivery(hq: boolean): THREE.MeshStandardNodeMaterial {
  const m: N = hq ? new THREE.MeshPhysicalNodeMaterial({ clearcoatRoughness: 0.1 }) : new THREE.MeshStandardNodeMaterial();
  const P: N = positionGeometry;
  const s: N = attribute('surf', 'vec4');
  const pat: N = attribute('pat', 'float');
  const pc: N = attribute('pcol', 'vec3');
  const base: N = vertexColor().rgb;
  const pid: N = floor(pat).sub(1);
  const param = fract(pat).mul(2);
  const ax = abs(P.x);
  const stripes = step(abs(ax.sub(0.11)), 0.045);
  const chev = step(0.6, fract(P.z.add(ax.mul(0.9)).mul(2.2)));
  const checker = mod(floor(P.x.mul(6)).add(floor(P.y.mul(6))).add(floor(P.z.mul(6))), 2);
  const split = step(P.y, param);
  const camo = step(0.12, snoise(floor(P.mul(6)).mul(0.41).add(0.3), hq));
  const gx = abs(fract(P.z.mul(4)).sub(0.5)), gy = abs(fract(P.x.mul(4).add(0.5)).sub(0.5));
  const gate: N = step(0.0, snoise(floor(P.mul(4)).mul(0.77), hq));
  const pads = step(length(fract(P.mul(4)).sub(0.5)), 0.13);
  const circuit = clamp(step(gx, 0.045).mul(gate).add(step(gy, 0.04).mul(gate.oneMinus())).add(pads), 0, 1);
  // ornamental scrollwork: thin isolines of two interfering waves (reads as gold filigree, not stripes)
  const fw = sin(P.z.mul(9).add(sin(P.x.mul(7).add(P.y.mul(5))).mul(1.6))).add(sin(P.x.mul(9).add(P.y.mul(4)).add(sin(P.z.mul(6)).mul(1.6))));
  const filigree = step(abs(fract(fw.mul(1.4)).sub(0.5)), 0.06);
  const pz = fract(P.z.mul(3.2)), py = fract(P.y.mul(3.2).add(0.2));
  const seam = step(0.93, max(pz, py));
  const rivet = step(length(vec3(pz.sub(0.08), py.sub(0.08), 0)), 0.04);
  const panels = clamp(seam.add(rivet), 0, 1);
  const aurora = smoothstep(0.1, 0.9, P.y.mul(1.6).add(sin(P.z.mul(3.4).add(P.x.mul(2))).mul(0.18)).add(0.1));
  const fl = snoise(vec3(P.x.mul(3), P.y.mul(3), P.z.mul(1.2)), hq).mul(0.35);
  const flames = step(P.z.mul(-1).add(0.35).add(fl), abs(P.x).mul(0.8).add(P.y.mul(0.3)).mul(-1).add(0.9)).mul(step(-0.35, P.z));
  const dots = step(length(fract(P.mul(5)).sub(0.5)), 0.2);
  const patterns: N[] = [stripes, chev, checker, split, camo, circuit, filigree, panels, aurora, flames, dots];
  let mask0: N;
  if (hq) {
    const pick = (i: number, a: N, rest: N): N => select(pid.equal(i), a, rest);
    mask0 = float(0);
    for (let i = patterns.length; i >= 1; i--) mask0 = pick(i, patterns[i - 1], mask0);
  } else {
    // Low: branch-free weighted sum. select() compiles to 11 nested if/else blocks, which SwiftShader's JIT
    // took ≈13 s to link; evaluating every pattern costs little on the few pixels a kart covers.
    mask0 = float(0);
    for (let i = 1; i <= patterns.length; i++) mask0 = mask0.add(patterns[i - 1].mul(float(1).sub(step(0.5, abs(pid.sub(i))))));
  }
  const mask = mask0.mul(step(0.5, pat));
  const paint = mix(base, pc, mask);
  m.colorNode = paint;
  m.roughnessNode = hq ? s.x : s.x.mul(0.85);
  m.metalnessNode = s.y;
  if (hq) m.clearcoatNode = s.w;
  m.emissiveNode = paint.mul(s.z).add(vec3(1, 0.96, 0.92).mul(fresnel(3).mul(0.1).mul(s.w).mul(fxUniforms.rimBoost)));
  return lowEnv(m, hq);
}

/**
 * Transparent kart overlay: race numbers, stickers, crests, glass, underglow, the contact shadow.
 * surf.x = opacity, surf.y = roughness, surf.z = glow, surf.w = 1 for the contact shadow (unlit black: a lit dark
 * plane would mirror the sky at grazing angles and read as a pale halo instead of a shadow).
 */
export function buildKartOverlay(atlas: THREE.Texture, hq = true): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.25, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  const t: N = texture(atlas, uv());
  const s: N = attribute('surf', 'vec4');
  const c: N = vertexColor().rgb.mul(t.rgb);
  m.colorNode = c;
  m.opacityNode = t.a.mul(s.x);
  m.roughnessNode = s.y;
  m.emissiveNode = c.mul(s.z);
  m.outputNode = mix(output, vec4(0, 0, 0, output.a), step(0.5, s.w));
  return lowEnv(m, hq);
}
