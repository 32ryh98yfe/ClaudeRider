// Bug Report: a cute flying bug with blurred flapping wings; wraps its victim in a bubble (trap_bug status).
import { defineItemVfx } from '../api.ts';
import { bug } from '../geo.ts';
import { makeProxy, once, orient } from '../proxy.ts';

const parts = once(() => bug());
const BUZZ = { shape: 0, additive: true, size0: 0.25, size1: 0.05, gravity: 0, drag: 2, emissive: 1.5 } as const;

export default defineItemVfx({
  key: 'item.bug_report',
  projectile() {
    const p = makeProxy(parts(), 'bug_report');
    return {
      root: p.root,
      update(v, _dt, t) {
        orient(p.root, v as never);
        p.root.position.y += Math.sin(t * 9) * 0.15;
        if (p.glow) p.glow.scale.y = 0.4 + Math.abs(Math.sin(t * 60)) * 1.2; // wing blur flap
      },
    };
  },
  trail(fx, v, dt) {
    const n = fx.sparks.rate(20, dt);
    for (let i = 0; i < n; i++) fx.sparks.spawn(v.x, v.y, v.z, 0, 0.2, 0, 0.4, 0.48, 0.85, 0.56, BUZZ);
  },
  use(fx, user) { if (user) fx.puff(user.pos, 4, '#7BD88F', 0.8); },
  impact(fx, at) { fx.flash(at, '#7BD88F', 2.5); fx.stars(at, 10, '#7BD88F', 1.5); },
});
