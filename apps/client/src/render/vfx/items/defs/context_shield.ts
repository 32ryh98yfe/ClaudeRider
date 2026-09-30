// Context Shield: Fresnel bubble with scrolling token bands (shield status, status.ts); glass pop on absorb.
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.context_shield',
  use(fx, user) { if (user) { fx.flash(user.pos, '#7DE2FC', 2.4); fx.ring(user.pos, '#7DE2FC', 3.4, 0.35); } },
});
