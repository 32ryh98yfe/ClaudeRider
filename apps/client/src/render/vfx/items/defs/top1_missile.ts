import * as THREE from 'three/webgpu';
import { defineItemVfx } from '../api.ts';
import { missile, numberOnePlate } from '../geo.ts';
import { makeProxy, once, orient } from '../proxy.ts';
import { MaterialLibrary } from '../../../materials/library.ts';

// Top-1 Missile: gold capsule with a glowing "#1" plate; gold fanfare flash on launch and a gold burst on hit.
const parts = once(() => missile('#F2C14E', '#FFD23F', '#fff3c4'));
const plate = once(() => numberOnePlate());
const TRAIL = [
  { shape: 0, additive: true, size0: 0.45, size1: 0.1, gravity: 0, drag: 2.5, emissive: 2.5, spin: 3 },
  { shape: 2, additive: true, size0: 0.45, size1: 0.1, gravity: 0, drag: 2.5, emissive: 2.5, spin: 3 },
] as const;

export default defineItemVfx({
  key: 'item.top1_missile',
  projectile() {
    const p = makeProxy(parts(), 'top1_missile');
    const num = new THREE.Mesh(plate(), MaterialLibrary.emissiveVertex(3));
    num.position.set(0, 0.24, 0); num.rotation.x = -Math.PI / 2; p.root.add(num);
    return { root: p.root, update(v) { orient(p.root, v as never); } };
  },
  trail(fx, v, dt) {
    const n = fx.sparks.rate(80, dt);
    for (let i = 0; i < n; i++) fx.sparks.spawn(v.x - v.dx, v.y - v.dy, v.z - v.dz, (Math.random() - 0.5), (Math.random() - 0.5) + 0.2, (Math.random() - 0.5), 0.45, 1, 0.82, 0.3, TRAIL[i & 1]!);
  },
  use(fx, user) { if (user) { fx.flash(user.pos, '#FFD23F', 3); fx.stars(user.pos, 16, '#FFD23F', 1.8); } },
  impact(fx, at) { fx.flash(at, '#FFD23F', 5); fx.stars(at, 24, '#FFC857', 2.6); fx.ring(at, '#FFD23F', 10, 0.5); fx.shake(0.14); },
});
