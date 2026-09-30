// Firewall: three 2.4 × 1.6 × 1.2 m brick blocks (one hazard each, 12-items-spec §2.2.10) drop in over the 24-tick
// arm time, lined up across the road; flame tips glow on top; bricks shatter on removal.
import { defineItemVfx, type HazardView } from '../api.ts';
import { firewall } from '../geo.ts';
import { makeProxy, once, placeHazard, ease01 } from '../proxy.ts';

const parts = once(() => firewall(2.4, 1.2, 1.6));
const EMBER = { shape: 0, additive: true, size0: 0.35, size1: 0.05, gravity: 1, drag: 1, emissive: 2 } as const;
const BRICK = { shape: 4, additive: false, size0: 0.3, size1: 0.2, gravity: -14, drag: 0.5, spin: 8, alpha: 1 } as const;

export default defineItemVfx({
  key: 'item.firewall',
  hazard() {
    const p = makeProxy(parts(), 'firewall');
    return {
      root: p.root,
      update(v, _dt, t) {
        const h = v as HazardView;
        placeHazard(p.root, h);
        const k = ease01(h.tick, h.arm - 24, 24);
        p.root.position.y += (1 - k) * 6;
        p.root.rotation.set(0, Math.atan2(-h.az, h.ax), 0);
        if (p.glow) p.glow.scale.y = 0.8 + Math.sin(t * 17) * 0.15;
      },
    };
  },
  hazardFx(fx, h, dt) {
    const n = fx.sparks.rate(10, dt);
    for (let i = 0; i < n; i++) {
      const o = (Math.random() - 0.5) * 2.4;
      fx.sparks.spawn(h.x + h.ax * o, h.y + 1.6, h.z + h.az * o, 0, 2 + Math.random() * 2, 0, 0.6, 1, 0.55, 0.2, EMBER);
    }
  },
  use(fx, user) { if (user) fx.flash(user.pos, '#ff8a3a', 2); },
  impact(fx, at) {
    for (let i = 0; i < 14; i++) fx.smoke.spawn(at.x + (Math.random() - 0.5) * 2.4, at.y + 0.5 + Math.random() * 1.5, at.z, (Math.random() - 0.5) * 8, 3 + Math.random() * 4, (Math.random() - 0.5) * 8, 1.1, 0.76, 0.33, 0.23, BRICK);
    fx.flash(at, '#ff8a3a', 3);
  },
});
