import * as THREE from 'three/webgpu';
import { defineItemVfx } from '../api.ts';
import { tokenBomb, disc } from '../geo.ts';
import { makeProxy, once, orient } from '../proxy.ts';
import { MaterialLibrary } from '../../../materials/library.ts';
import type { ProjectileView } from '../api.ts';

// Token Bomb: a lobbed token sphere; a ground decal marks the 6.5 m landing circle and turns red for the last
// 30 ticks (0.5 s) before impact. Victims get the trap_bomb bubble (status.ts).
const parts = once(() => tokenBomb());
const ringGeo = once(() => disc());
const RED = new THREE.Color('#E5484D'), IVORY = new THREE.Color('#FAF9F5');
const FUSE = { shape: 1, additive: true, size0: 0.05, size1: 0.02, gravity: -4, drag: 1, stretch: 0.05, emissive: 3 } as const;

export default defineItemVfx({
  key: 'item.token_bomb',
  projectile() {
    const p = makeProxy(parts(), 'token_bomb');
    const ring = new THREE.Mesh(ringGeo(), MaterialLibrary.ringDecal('#FAF9F5'));
    ring.scale.setScalar(13);
    ring.userData['fxColor'] = IVORY.clone();
    const root = new THREE.Group(); root.add(p.root, ring);
    let groundY = Number.NaN;
    return {
      root,
      update(v, _dt, t) {
        const pv = v as ProjectileView;
        orient(p.root, pv); p.root.rotateX(t * 5);
        if (Number.isNaN(groundY)) groundY = pv.y - 1.2;          // launch height ≈ kart roof: the ground is below
        const left = Math.max(0, pv.impact - pv.tick);
        // project the landing point along the lob: the decal leads the bomb by its remaining flight
        ring.position.set(pv.x + pv.dx * Math.min(32, left * 0.9), groundY + 0.06, pv.z + pv.dz * Math.min(32, left * 0.9));
        ring.position.sub(p.root.position).add(p.root.position);
        (ring.userData['fxColor'] as THREE.Color).copy(pv.impact > 0 && left <= 30 ? RED : IVORY);
      },
    };
  },
  trail(fx, v, dt) {
    const n = fx.sparks.rate(40, dt);
    for (let i = 0; i < n; i++) fx.sparks.spawn(v.x, v.y + 0.85, v.z, (Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5), 0.3, 1, 0.8, 0.3, FUSE);
  },
  impact(fx, at) { fx.flash(at, '#FFC857', 4); fx.ring(at, '#FFC857', 13, 0.45); fx.stars(at, 18, '#FFC857', 2.2); fx.shake(0.08); },
});
