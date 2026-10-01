// Left-side twins of directional props. PROPS rows turn side=L props by 180°, so a board whose chevrons point along
// local +Z would point against the travel direction there (a wrong-way arrow). Mirroring the model in Z (and flipping
// the triangle winding so faces stay front-facing) gives the twin whose arrows point forward on the left.
// Shared by the Sunstone Desert and Frostbyte Glacier kits (`ad_board_b_l`, the same name main uses).
import * as THREE from 'three/webgpu';
import type { PropFactory } from '../../props/defaults.ts';
import { TRACKSIDE_PROPS } from '../../props/trackside.ts';

/** Mirror a non-indexed geometry in local Z and restore counter-clockwise winding. */
export function mirrorZ(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute, n = a.itemSize, arr = a.array as Float32Array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < n; k++) {
      const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k, tmp = arr[i1]!;
      arr[i1] = arr[i2]!; arr[i2] = tmp;
    }
    a.needsUpdate = true;
  }
  g.computeBoundingSphere();
  return g;
}

/** `ad_board_b` (yellow chevrons) for side=L rows: arrows point forward once the row turns it to face the road. */
export const AD_BOARD_B_L: PropFactory = {
  maxInstances: 60,
  build: (pal) => {
    const b = TRACKSIDE_PROPS['ad_board_b']!.build(pal);
    return { geometry: mirrorZ(b.geometry), material: b.material, castShadow: b.castShadow ?? true };
  },
};
