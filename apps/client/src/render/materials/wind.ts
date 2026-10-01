// One wind field for foliage props, grass and the far forest (33-ultra-graphics §5). S-Mat/S-Flora may extend it with
// gust waves; every consumer goes through `windAt` so trees and grass sway together.
import { vec3 } from 'three/tsl';
import { windOffset } from './tsl.ts';

type N = any;

/**
 * Wind displacement (vec3, world metres) for a point. `phase` per-instance phase (radians), `mask` 0 at the root → 1 at
 * the tip, `amp` tip amplitude in metres. `posW` is reserved for travelling gusts (unused by the stub).
 */
export function windAt(_posW: N, phase: N, mask: N, amp = 0.08): N {
  return windOffset(phase, mask, amp).add(vec3(0));
}
