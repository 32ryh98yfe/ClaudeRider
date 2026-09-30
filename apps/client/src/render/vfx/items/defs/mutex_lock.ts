// Mutex Lock: a padlock flies to each opponent and hangs over its item slots (slot_lock status, status.ts).
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.mutex_lock',
  use(fx, user) { if (user) { fx.flash(user.pos, '#E0B04B', 2); fx.stars(user.pos, 8, '#E0B04B', 1.6); } },
});
