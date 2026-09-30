// Throttle Drone: a hex drone with a glowing "429" panel flies to the leader; the throttle status then hangs a
// tractor-beam cone over the victim (brighter per stack).
import { defineItemVfx, type ProjectileView } from '../api.ts';
import { drone } from '../geo.ts';
import { makeProxy, once } from '../proxy.ts';

const parts = once(() => drone());
const WASH = { shape: 0, additive: true, size0: 0.4, size1: 0.1, gravity: 0, drag: 2, emissive: 1.6 } as const;

export default defineItemVfx({
  key: 'item.throttle_drone',
  projectile() {
    const p = makeProxy(parts(), 'throttle_drone');
    return {
      root: p.root,
      update(v, _dt, t) {
        const pv = v as ProjectileView;
        p.root.position.set(pv.x, pv.y + 1.2 + Math.sin(t * 5) * 0.12, pv.z);
        p.root.rotation.set(0, Math.atan2(pv.dx, pv.dz), Math.sin(t * 3) * 0.1);
      },
    };
  },
  trail(fx, v, dt) {
    const n = fx.sparks.rate(16, dt);
    for (let i = 0; i < n; i++) fx.sparks.spawn(v.x, v.y + 1.0, v.z, 0, -1.5, 0, 0.3, 0.62, 0.83, 1, WASH);
  },
  use(fx, user) { if (user) fx.puff(user.pos, 6, '#c8ccd4', 1.2); },
  impact(fx, at) { fx.flash(at, '#ff5a5a', 2); },
});
