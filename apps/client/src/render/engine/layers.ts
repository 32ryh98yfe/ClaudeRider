// Render layers. Effects that must stay out of screen-space buffers (sparks, smoke, flames, item VFX, headlight cones,
// the Time Attack hologram) live on LAYER_FX: the race camera sees both layers, while the Ultra prepass that feeds
// AO, contact shadows, TRAA, motion blur and DoF renders layer 0 only (33-ultra-graphics §4 "prepass").
import type * as THREE from 'three/webgpu';

export const LAYER_WORLD = 0;
export const LAYER_FX = 1;

/** Moves `root` and its descendants to LAYER_FX only. */
export function tagFx(root: THREE.Object3D): void {
  root.traverse((o) => { o.layers.set(LAYER_FX); });
}
