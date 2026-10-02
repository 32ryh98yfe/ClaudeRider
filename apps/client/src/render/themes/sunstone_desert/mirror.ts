// Left-side twins of directional props. PROPS rows turn side=L props by 180°, so a board whose chevrons point along
// local +Z would point against the travel direction there (a wrong-way arrow). Mirroring the model in Z (and flipping
// the triangle winding so faces stay front-facing) gives the twin whose arrows point forward on the left.
// Shared by the Sunstone Desert and Frostbyte Glacier kits (`ad_board_b_l`, the same name main uses), together with
// navy-backed versions of the shared sponsor boards.
import * as THREE from 'three/webgpu';
import type { PropFactory } from '../../props/defaults.ts';
import { TRACKSIDE_PROPS } from '../../props/trackside.ts';
import { merge, paint, place, box } from '../../util/geo.ts';

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

/**
 * Sponsor board with a navy back plate. Seen from outside a corner the shared boards show a large blank pale-grey
 * back that out-shouts the track; a back in the trackside navy reads as an ordered row instead. Plate size matches
 * the shared board (3 m × 0.95 m panel centred 1.595 m up, frame back face at x = −0.11).
 */
function backed(kind: string, mirror: boolean, lift = 0): PropFactory {
  return {
    maxInstances: 60,
    build: (pal) => {
      const b = TRACKSIDE_PROPS[kind]!.build(pal);
      const parts = [mirror ? mirrorZ(b.geometry) : b.geometry, paint(place(box(0.02, 1.05, 3.1), -0.12, 1.595, 0), '#2f4a7a')];
      if (lift > 0) {
        // raised variant: the whole board moves up `lift` (local m) and its two posts are extended down to the ground
        for (const g of parts) g.translate(0, lift, 0);
        for (const z of [-1.25, 1.25]) parts.push(paint(place(box(0.09, lift + 0.02, 0.09), -0.05, lift / 2, z), '#5b4a3a'));
      }
      return { geometry: merge(parts), material: b.material, castShadow: b.castShadow ?? true };
    },
  };
}

/** The three shared boards with navy backs, `ad_board_b_l` (the chevron board for side=L rows, arrows forward) and
 *  tall chevron twins for corners. */
export const BACKED_BOARDS: Record<string, PropFactory> = {
  ad_board_a: backed('ad_board_a', false), ad_board_b: backed('ad_board_b', false), ad_board_c: backed('ad_board_c', false),
  ad_board_b_l: backed('ad_board_b', true),
  // tall corner chevrons: posts 0.8 m higher at the scale 1.8 the corner rows use (0.8 / 1.8 local), so the arrows read
  // above a 1.4 m rock wall and over a crest
  ad_board_b_tall: backed('ad_board_b', false, 0.8 / 1.8), ad_board_b_l_tall: backed('ad_board_b', true, 0.8 / 1.8),
};
