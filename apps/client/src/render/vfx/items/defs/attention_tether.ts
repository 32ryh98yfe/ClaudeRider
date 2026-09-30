// Attention Tether: a beam of "attention head" dots shoots forward; the tether_pull status draws the dotted
// beam user <-> target and the slingshot streak (status.ts).
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.attention_tether',
  use(fx, user) {
    if (!user) return;
    for (let i = 0; i < 14; i++) {
      const d = 1 + i * 1.6;
      fx.sparks.spawn(user.pos.x + user.fwd.x * d, user.pos.y + 1.0, user.pos.z + user.fwd.z * d, user.fwd.x * 18, 0, user.fwd.z * 18, 0.3 + i * 0.01, 0.71, 0.49, 1,
        { shape: 0, additive: true, size0: 0.35, size1: 0.2, gravity: 0, drag: 2, emissive: 2.4 });
    }
  },
});
