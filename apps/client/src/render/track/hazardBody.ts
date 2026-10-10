// A visible damaging body must fit its declared convex contact shape. Suspension ropes/stems are separate
// decoration: fitting a seven-metre rope together with a small bob would shrink the whole obstacle to a speck.
import * as THREE from 'three/webgpu';

export interface HazardBodyShape {
  kind: string; shape: string; size: readonly number[]; motion?: { type: string };
}

/** Returns owned geometry, leaving the theme's cached source untouched. The collider dimensions never change. */
export function fitHazardBody(source: THREE.BufferGeometry, shape: HazardBodyShape): { geometry: THREE.BufferGeometry; transform: THREE.Matrix4 } {
  source.computeBoundingBox();
  const bounds = source.boundingBox!, centre = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const capsule = shape.kind === 'swinger' || shape.motion?.type === 'pendulum' || shape.motion?.type === 'rotate';
  const base = shape.shape === 'box' || shape.shape !== 'sphere' && !capsule;
  if (base) centre.y = bounds.min.y;
  const transform = new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z);
  let sx = 1, sy = 1, sz = 1;
  const [r = 1, height = 1, up = 1] = shape.size;
  if (shape.shape === 'box') {
    sx = Math.min(1, height / Math.max(size.x, 1e-8));
    sy = Math.min(1, up / Math.max(size.y, 1e-8));
    sz = Math.min(1, r / Math.max(size.z, 1e-8));
  } else {
    const p = source.getAttribute('position');
    // Uniform fitting retains the silhouette of a curled tentacle or a rounded lantern. The origin lies
    // inside the convex shape, so containment is monotonic as the scale decreases.
    const fits = (scale: number): boolean => {
      for (let i = 0; i < p.count; i++) {
        const x = (p.getX(i) - centre.x) * scale, y = (p.getY(i) - centre.y) * scale, z = (p.getZ(i) - centre.z) * scale;
        if (shape.shape === 'sphere') { if (x * x + y * y + z * z > r * r) return false; }
        else if (capsule) { const end = Math.max(0, Math.abs(y) - height / 2); if (x * x + z * z + end * end > r * r) return false; }
        else if (y < 0 || y > height || x * x + z * z > r * r) return false;
      }
      return true;
    };
    if (!fits(1)) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      sx = sy = sz = lo;
    }
  }
  transform.premultiply(new THREE.Matrix4().makeScale(sx, sy, sz));
  const geometry = source.clone().applyMatrix4(transform);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, transform };
}

/** Keep the upper suspension point fixed and move its lower attachment with the fitted body. */
export function fitHazardSuspension(source: THREE.BufferGeometry, bodyTransform: THREE.Matrix4): THREE.BufferGeometry {
  source.computeBoundingBox();
  const min = source.boundingBox!.min.y, max = source.boundingBox!.max.y;
  const attached = new THREE.Vector3(0, min, 0).applyMatrix4(bodyTransform).y;
  const scale = (max - attached) / Math.max(max - min, 1e-8);
  return source.clone().translate(0, -min, 0).scale(1, scale, 1).translate(0, attached, 0);
}
