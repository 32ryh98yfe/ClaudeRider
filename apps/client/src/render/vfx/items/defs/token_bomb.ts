import * as THREE from 'three/webgpu';
import { defineItemVfx } from '../api.ts';
import { tokenBomb, disc } from '../geo.ts';
import { makeProxy, once, orient } from '../proxy.ts';
import { MaterialLibrary } from '../../../materials/library.ts';
import type { HazardView, ProjectileView } from '../api.ts';

// Token Bomb. The sim spawns a hazard at the landing point with arm = expire = landing tick; the 36-tick flight is
// the lead. The bomb is drawn lobbing from the thrower to that point (apex 3 m over the chord). A ground decal marks
// the 6.25 m trap circle and turns red for the last 30 ticks (0.5 s). The burst plays on removal (landing). Victims
// get the trap_bomb bubble (status.ts). The projectile form is kept for content that fires it as a projectile.
const FLIGHT = 36, APEX = 3;
const parts = once(() => tokenBomb());
const ringGeo = once(() => disc());
const RED = new THREE.Color('#E5484D'), IVORY = new THREE.Color('#FAF9F5');
const FUSE = { shape: 1, additive: true, size0: 0.05, size1: 0.02, gravity: -4, drag: 1, stretch: 0.05, emissive: 3 } as const;

function decal(): THREE.Mesh {
  const ring = new THREE.Mesh(ringGeo(), MaterialLibrary.ringDecal('#FAF9F5'));
  ring.userData['fxColor'] = IVORY.clone();
  return ring;
}

export default defineItemVfx({
  key: 'item.token_bomb',
  hazard() {
    const p = makeProxy(parts(), 'token_bomb');
    const ring = decal();
    const root = new THREE.Group(); root.add(p.root, ring);
    let id = -1, sx = 0, sy = 0, sz = 0;
    return {
      root,
      update(v, _dt, t) {
        const h = v as HazardView;
        if (h.id !== id) { id = h.id; sx = h.ox; sy = h.oy + 1.2; sz = h.oz; } // pooled instance: new throw
        const left = Math.max(0, h.arm - h.tick);
        const u = 1 - Math.min(1, left / FLIGHT);
        p.root.position.set(sx + (h.x - sx) * u, sy + (h.y + 0.55 - sy) * u + 4 * APEX * u * (1 - u), sz + (h.z - sz) * u);
        h.px = p.root.position.x; h.py = p.root.position.y; h.pz = p.root.position.z;
        p.root.rotation.set(t * 5, t * 1.3, 0);
        ring.position.set(h.x, h.y + 0.06, h.z);
        ring.scale.setScalar(h.radius * 2);
        (ring.userData['fxColor'] as THREE.Color).copy(left <= 30 ? RED : IVORY);
      },
    };
  },
  hazardFx(fx, h, dt) {
    if (h.arm - h.tick <= 0) return;
    const n = fx.sparks.rate(30, dt);
    for (let i = 0; i < n; i++) fx.sparks.spawn(h.px, h.py + 0.85, h.pz, (Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5), 0.3, 1, 0.8, 0.3, FUSE);
  },
  projectile() {
    const p = makeProxy(parts(), 'token_bomb');
    const ring = decal();
    ring.scale.setScalar(12.5);
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
