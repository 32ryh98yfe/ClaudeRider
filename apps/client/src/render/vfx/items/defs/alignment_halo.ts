// Alignment Halo: gold torus over every teammate (halo status, status.ts); flashes on absorb.
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.alignment_halo',
  use(fx, user) { if (user) { fx.stars(user.pos, 14, '#FFD23F', 1.4); fx.flash(user.pos, '#FFD23F', 2.4); } },
});
