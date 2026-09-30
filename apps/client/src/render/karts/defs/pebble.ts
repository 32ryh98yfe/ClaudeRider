// Pebble — starter open tube-frame go-kart (1.6 × 1.1 × 0.5 m, wheels r 0.22).
import * as THREE from 'three/webgpu';
import type { KartBodyDef, KartModel, Livery } from '../types.ts';
import { MaterialLibrary } from '../../materials/library.ts';
import { merge, paint, place, rbox, box, cyl, torus } from '../../util/geo.ts';

function build(l: Livery): KartModel {
  const root = new THREE.Group();
  root.name = 'kart:pebble';
  const body = merge([
    paint(place(rbox(1.0, 0.1, 1.5, 0.05, 2), 0, 0.2, 0), '#2b2b2e'),                       // floor pan
    paint(place(rbox(0.28, 0.2, 1.1, 0.08, 3), -0.47, 0.3, 0.05), l.primary),              // side pods
    paint(place(rbox(0.28, 0.2, 1.1, 0.08, 3), 0.47, 0.3, 0.05), l.primary),
    paint(place(rbox(0.9, 0.18, 0.34, 0.08, 3), 0, 0.3, 0.72), l.primary),                 // nose
    paint(place(rbox(0.5, 0.06, 0.2, 0.03, 2), 0, 0.42, 0.72), l.secondary),               // number plate
    paint(place(rbox(0.56, 0.32, 0.18, 0.06, 2), 0, 0.46, -0.3, -0.25, 0, 0), '#3a3a3f'),  // seat back
    paint(place(rbox(0.56, 0.08, 0.4, 0.04, 2), 0, 0.3, -0.12), '#3a3a3f'),                // seat base
    paint(place(rbox(0.6, 0.26, 0.34, 0.06, 2), 0, 0.36, -0.66), '#515158'),               // engine
    paint(place(cyl(0.05, 0.05, 1.2, 8), 0, 0.26, -0.82, 0, 0, Math.PI / 2), '#8a8a90'),   // rear bumper tube
    paint(place(cyl(0.045, 0.045, 1.1, 8), 0, 0.24, 0.92, 0, 0, Math.PI / 2), '#8a8a90'),  // front bumper tube
    paint(place(cyl(0.035, 0.035, 0.5, 8), 0, 0.5, 0.28, -0.9, 0, 0), '#2b2b2e'),          // steering column
    paint(place(rbox(0.1, 0.02, 0.6, 0.01, 1), -0.2, 0.43, 0.72), l.secondary),            // stripes
    paint(place(rbox(0.1, 0.02, 0.6, 0.01, 1), 0.2, 0.43, 0.72), l.secondary),
  ]);
  const bodyMesh = new THREE.Mesh(body, MaterialLibrary.kartPaint(l.primary));
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  root.add(bodyMesh);
  const steering = new THREE.Group();
  steering.position.set(0, 0.62, 0.18);
  steering.rotation.x = -0.9;
  const wheelGeo = paint(torus(0.13, 0.025, 6, 16), '#1f1f22');
  steering.add(new THREE.Mesh(wheelGeo, MaterialLibrary.vertexLit(0.5, 0.2)));
  root.add(steering);
  // wheels: tyre + rim merged
  const tyre = merge([
    paint(place(cyl(0.22, 0.22, 0.2, 18), 0, 0, 0, 0, 0, Math.PI / 2), '#1c1c1f'),
    paint(place(cyl(0.13, 0.13, 0.21, 12), 0, 0, 0, 0, 0, Math.PI / 2), l.secondary),
    paint(place(box(0.215, 0.05, 0.3), 0, 0, 0), '#9a9aa0'),
  ]);
  const wheelMat = MaterialLibrary.vertexLit(0.8, 0.1);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.58, 0.58], [0.58, 0.58], [-0.6, -0.55], [0.6, -0.55]] as const) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.22, z);
    const w = new THREE.Mesh(tyre, wheelMat); w.castShadow = true;
    pivot.add(w); root.add(pivot); wheels.push(pivot);
  }
  const seat = new THREE.Object3D(); seat.position.set(0, 0.34, -0.1); root.add(seat);
  const exhausts = [new THREE.Object3D(), new THREE.Object3D()];
  exhausts[0]!.position.set(-0.18, 0.38, -0.86); exhausts[1]!.position.set(0.18, 0.38, -0.86);
  for (const e of exhausts) root.add(e);
  let spin = 0;
  return {
    root, wheels, steering, seat, exhausts,
    update(s, dt): void {
      spin += s.wheelSpin * dt;
      for (let i = 0; i < 4; i++) {
        const p = wheels[i]!;
        p.children[0]!.rotation.x = spin;
        if (i < 2) p.rotation.y = -s.steer * 0.45;
      }
      steering.rotation.z = s.steer * 1.2;
    },
    dispose(): void { body.dispose(); tyre.dispose(); },
  };
}

const def: KartBodyDef = { id: 'pebble', dims: { length: 1.6, width: 1.1, height: 0.5, wheelR: 0.22 }, build };
export default def;
