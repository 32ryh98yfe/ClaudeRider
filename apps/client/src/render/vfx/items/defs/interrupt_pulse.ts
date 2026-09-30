// Interrupt Pulse: expanding ring (with a glyph burst) that clears drones; drones fall and fizzle.
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.interrupt_pulse',
  use(fx, user) {
    if (!user) return;
    fx.ring(user.pos, '#7DE2FC', 22, 0.6);
    fx.ring(user.pos, '#FAF9F5', 12, 0.4);
    fx.flash(user.pos, '#7DE2FC', 3);
    fx.shake(0.05);
  },
});
