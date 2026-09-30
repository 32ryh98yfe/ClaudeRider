// Overclock Aura: spinning spark halo + red/blue strobes around the user (the overclock status keeps it going).
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.overclock_aura',
  use(fx, user) {
    if (!user) return;
    fx.ring(user.pos, '#ff4d6d', 6, 0.4);
    fx.ring(user.pos, '#2ACAFF', 4, 0.5);
    fx.stars(user.pos, 12, '#FFD23F', 1.4);
  },
});
