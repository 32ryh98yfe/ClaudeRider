// Interpretability Lens: the magnifier sweep lives on the standings (UI); in-world a soft scan ring pulses out.
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.interpretability_lens',
  use(fx, user) { if (user) { fx.ring(user.pos, '#A6FFCB', 9, 0.6); fx.ring(user.pos, '#A6FFCB', 5, 0.4); } },
});
