// Prompt Missile: ivory capsule with coral nose and spark fins, a `>_` text-ribbon trail of glowing bits.
import { defineItemVfx } from '../api.ts';
import { missile } from '../geo.ts';
import { makeProxy, once, orient } from '../proxy.ts';

const parts = once(() => missile('#FAF9F5', '#D97757', '#FFB08F'));
const GLYPH = { shape: 4, additive: true, size0: 0.14, size1: 0.08, gravity: 0, drag: 3, emissive: 1.5, spin: 0 } as const;
const PUFF = { shape: 0, additive: true, size0: 0.5, size1: 0.15, gravity: 0, drag: 3, emissive: 2 } as const;

export default defineItemVfx({
  key: 'item.prompt_missile',
  projectile() {
    const p = makeProxy(parts(), 'prompt_missile');
    return { root: p.root, update(v, _dt, t) { orient(p.root, v as never); p.root.rotateZ(t * 6); } };
  },
  trail(fx, v, dt) {
    const n = fx.sparks.rate(90, dt);
    for (let i = 0; i < n; i++) {
      const glyph = i % 3 === 0;
      fx.sparks.spawn(v.x - v.dx * 0.8, v.y - v.dy * 0.8, v.z - v.dz * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8 + 0.3, (Math.random() - 0.5) * 0.8,
        glyph ? 0.55 : 0.35, glyph ? 0.98 : 1, glyph ? 0.98 : 0.6, glyph ? 0.96 : 0.35, glyph ? GLYPH : PUFF);
    }
  },
  use(fx, user) { if (user) fx.puff(user.pos, 6, '#dcd6cc', 1); },
  impact(fx, at) { fx.flash(at, '#ffb36a', 3.5); fx.stars(at, 14, '#FFD23F', 2); fx.puff(at, 10, '#8a8680', 2.2); fx.shake(0.1); },
});
