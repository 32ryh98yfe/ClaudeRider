// Broadcast Bolt: the sky flickers for the 21-tick telegraph, then bolts strike every victim (the stun status adds
// the strike column and electric arcs, status.ts).
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.broadcast_bolt',
  use(fx, user) {
    fx.flicker(0.35);
    if (user) fx.flash(user.pos, '#9fd3ff', 2.5);
  },
});
