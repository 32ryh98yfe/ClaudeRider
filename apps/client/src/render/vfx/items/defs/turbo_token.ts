// Turbo Token: a coral token is sucked into the exhaust; the ITEM flame kind does the rest (flames.ts).
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.turbo_token',
  use(fx, user) {
    if (!user) return;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      fx.sparks.spawn(user.pos.x + Math.cos(a) * 1.4, user.pos.y + 1.0 + Math.sin(a) * 0.4, user.pos.z + Math.sin(a) * 1.4,
        -Math.cos(a) * 3 - user.fwd.x * 4, -0.6, -Math.sin(a) * 3 - user.fwd.z * 4, 0.35, 0.85, 0.47, 0.34,
        { shape: 2, additive: true, size0: 0.3, size1: 0.1, gravity: 0, drag: 1, emissive: 2.5, spin: 4 });
    }
    fx.flash(user.pos, '#D97757', 1.6);
  },
});
