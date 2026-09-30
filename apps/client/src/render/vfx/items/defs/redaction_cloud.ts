// Redaction Cloud: an ink-black soft-particle cloud (r 10 m) while the volume lasts; the screen overlay of
// redaction bars is UI (L10). Driven by the hazard record.
import { defineItemVfx } from '../api.ts';

const INK = { shape: 5, additive: false, size0: 2.2, size1: 4.5, gravity: 0, drag: 1, alpha: 0.7 } as const;

export default defineItemVfx({
  key: 'item.redaction_cloud',
  hazardFx(fx, h, dt) {
    const r = Math.max(4, h.radius);
    const n = fx.smoke.rate(30, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      fx.smoke.spawn(h.x + Math.cos(a) * d, h.y + 0.5 + Math.random() * 3, h.z + Math.sin(a) * d, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, 2.2, 0.05, 0.05, 0.07, INK);
    }
  },
  use(fx, user) { if (user) fx.puff(user.pos, 10, '#141413', 1.8); },
});
