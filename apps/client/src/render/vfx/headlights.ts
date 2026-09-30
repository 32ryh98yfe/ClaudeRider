// Headlights for night / underground themes (30-art-bible §4): emissive lamp dots + additive beam cones for
// every kart in one instanced draw, plus one SpotLight on the local kart on High (no shadow).
import * as THREE from 'three/webgpu';
import { attribute, uv, float, smoothstep, mix, vec3, color } from 'three/tsl';
import { MaterialLibrary } from '../materials/library.ts';
import { setEmissive } from '../materials/tsl.ts';
import type { KartPose } from './driving.ts';

function geometry(): THREE.BufferGeometry {
  // beam: open cone along +Z from the nose (r 0.25 → 3.2 over 16 m); lamps: two small discs facing +Z
  const beam = new THREE.CylinderGeometry(3.2, 0.25, 16, 18, 1, true);
  beam.translate(0, 8, 0); beam.rotateX(Math.PI / 2); beam.translate(0, 0.45, 0.9); // narrow end at the nose, +Z ahead
  const parts: THREE.BufferGeometry[] = [beam.toNonIndexed()];
  for (const x of [-0.32, 0.32]) { const d = new THREE.CircleGeometry(0.1, 10); d.translate(x, 0.45, 0.92); parts.push(d.toNonIndexed()); }
  const flags: number[] = [];
  let total = 0;
  parts.forEach((p, i) => { const n = p.attributes.position!.count; total += n; for (let k = 0; k < n; k++) flags.push(i === 0 ? 0 : 1); });
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'uv'] as const) {
    const size = parts[0]!.attributes[name]!.itemSize;
    const arr = new Float32Array(total * size);
    let o = 0; for (const p of parts) { arr.set(p.attributes[name]!.array as Float32Array, o); o += p.attributes[name]!.array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.setAttribute('hlLamp', new THREE.BufferAttribute(new Float32Array(flags), 1));
  return out;
}

export class Headlights {
  readonly mesh: THREE.InstancedMesh;
  readonly spot: THREE.SpotLight | null;
  private used = 0;
  private m4 = new THREE.Matrix4(); private x = new THREE.Vector3(); private z = new THREE.Vector3();

  constructor(max: number, withSpot: boolean) {
    const mat = MaterialLibrary.custom('headlights', () => {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const lamp = attribute('hlLamp', 'float');
      const along = uv().y;                                // 0 at the nose → 1 at the far end
      const beamA = smoothstep(1.0, 0.0, along).mul(smoothstep(0.0, 0.08, along)).mul(0.1);
      const warm = color('#fff1cf');
      m.colorNode = mix(warm.mul(beamA), vec3(1, 0.97, 0.88).mul(3), lamp);
      m.opacityNode = mix(beamA, float(1), lamp);
      setEmissive(m, mix(warm.mul(beamA.mul(0.5)), vec3(1, 0.95, 0.8).mul(2.5), lamp));
      return m;
    });
    this.mesh = new THREE.InstancedMesh(geometry(), mat, max);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 3; this.mesh.name = 'headlights';
    if (withSpot) {
      this.spot = new THREE.SpotLight('#fff1cf', 60, 45, 0.55, 0.6, 1.6);
      this.spot.position.set(0, 0.8, 0.8);
      this.spot.target.position.set(0, 0, 12);
      this.spot.castShadow = false;
    } else this.spot = null;
  }

  begin(): void { this.used = 0; }
  kart(p: KartPose): void {
    if (!p.visible || this.used >= this.mesh.instanceMatrix.count) return;
    this.z.copy(p.fwd); this.x.copy(p.left);
    this.m4.makeBasis(this.x, p.up, this.z).setPosition(p.pos);
    this.mesh.setMatrixAt(this.used++, this.m4);
  }
  end(): void { this.mesh.count = this.used; if (this.used) this.mesh.instanceMatrix.needsUpdate = true; }
  dispose(): void { this.mesh.geometry.dispose(); this.spot?.removeFromParent(); }
}
