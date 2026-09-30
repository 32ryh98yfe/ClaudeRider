// FX materials shared by the VFX systems: boost flames (per-object colours), glow shells, decals.
import * as THREE from 'three/webgpu';
import { color, float, vec3, uv, time, mix, smoothstep, sin, uniform, abs, positionLocal } from 'three/tsl';
import { fresnel, setEmissive, vnoise } from './tsl.ts';
import type { NodeFrame } from 'three/webgpu';

type N = any;

/** Per-mesh flame parameters read by the shared flame material through object-update uniforms. */
export interface FlameUserData { fxCore: THREE.Color; fxEdge: THREE.Color; fxHeat: number }

/** Additive boost flame (legacy two-colour form, one material per colour pair). */
export function buildFlame(c1: string, c2: string): THREE.MeshBasicNodeMaterial {
  return flameGraph(color(c1), color(c2), float(1));
}

/**
 * Shared additive flame: one material for every kart and kind. Colours and heat come from
 * `mesh.userData.{fxCore, fxEdge, fxHeat}` via onObjectUpdate uniforms (no per-kart materials).
 */
export function buildFlameShared(): THREE.MeshBasicNodeMaterial {
  const dCore = new THREE.Color('#FFD23F'), dEdge = new THREE.Color('#FF5A36');
  const ud = (f: NodeFrame): Partial<FlameUserData> => (f.object?.userData ?? {}) as Partial<FlameUserData>;
  const core = uniform(dCore.clone()).onObjectUpdate((f: NodeFrame) => ud(f).fxCore ?? dCore);
  const edge = uniform(dEdge.clone()).onObjectUpdate((f: NodeFrame) => ud(f).fxEdge ?? dEdge);
  const heat = uniform(1).onObjectUpdate((f: NodeFrame) => ud(f).fxHeat ?? 1);
  return flameGraph(core, edge, heat);
}

function flameGraph(core: N, edge: N, heat: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const U = uv();
  const along = U.y;                                   // 0 at the nozzle → 1 at the tip
  const flick = sin(time.mul(43).add(along.mul(14))).mul(0.12).add(0.88);
  const n = vnoise(vec3(U.x.mul(4), along.mul(5).sub(time.mul(11)), 0.5));
  const c = mix(core, edge, smoothstep(0.05, 0.75, along));
  const body = float(1).sub(along).mul(smoothstep(0.0, 0.06, along).mul(0.6).add(0.4));
  const a = body.mul(n.mul(0.7).add(0.45)).mul(flick).clamp(0, 1);
  const col = c.mul(heat).mul(2.4);
  m.colorNode = col;
  m.opacityNode = a;
  // the post pipeline writes emissive with the fragment alpha and material blending, so no premultiply here
  setEmissive(m, col.mul(1.6));
  return m;
}

/** Per-object colour: meshes set `userData.fxColor` (THREE.Color); falls back to the material default. */
function objectColor(fallback: string): N {
  const def = new THREE.Color(fallback);
  return uniform(new THREE.Color(fallback)).onObjectUpdate((f: NodeFrame) => (f.object?.userData['fxColor'] as THREE.Color | undefined) ?? def);
}

/** Fresnel bubble (shield, trap bubbles, beams, pulse guard): additive, rim-bright, optional scrolling bands. */
export function buildBubble(c: string, bands: boolean): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false });
  const f = fresnel(2.2);
  const scan = bands ? smoothstep(0.4, 0.5, abs(sin(positionLocal.y.mul(18).sub(time.mul(3))))).mul(0.25) : float(0);
  const col = objectColor(c);
  m.colorNode = col.mul(f.mul(1.4).add(0.08).add(scan));
  m.opacityNode = f.mul(0.85).add(0.1).add(scan).clamp(0, 1);
  setEmissive(m, col.mul(f.mul(0.9).add(scan)));
  return m;
}

/**
 * Time Attack ghost: a cool hologram (translucent body, bright Fresnel rim, faint scanlines) so it reads as a
 * record rather than a rival. Unlit and fog-free: one draw per ghost mesh, no shadows.
 */
export function buildGhost(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, fog: false });
  const f = fresnel(2.0);
  const scan = smoothstep(0.35, 0.5, abs(sin(positionLocal.y.mul(26).sub(time.mul(2.2))))).mul(0.12);
  const body = color('#9fd3f5'), rim = color('#eaf8ff');
  m.colorNode = mix(body, rim, f).mul(float(0.55).add(scan));
  m.opacityNode = f.mul(0.55).add(0.16).add(scan).clamp(0, 0.85);
  setEmissive(m, rim.mul(f.mul(0.6)));
  return m;
}

/** Ground decal ring (landing circles, hazard telegraphs): additive, uv radial ring, pulsing; colour per object. */
export function buildRingDecal(c: string): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const d = uv().sub(0.5).length().mul(2);
  const ring = smoothstep(0.78, 0.9, d).mul(smoothstep(1.0, 0.93, d));
  const fill = smoothstep(1.0, 0.0, d).mul(0.12);
  const pulse = sin(time.mul(9)).mul(0.25).add(0.75);
  const col = objectColor(c);
  m.colorNode = col.mul(1.5);
  m.opacityNode = ring.add(fill).mul(pulse);
  setEmissive(m, col.mul(ring.mul(pulse).mul(1.5)));
  return m;
}
