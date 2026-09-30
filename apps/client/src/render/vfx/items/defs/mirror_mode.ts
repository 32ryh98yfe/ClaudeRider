// Mirror Mode: mirrored-arrow glyph over each victim during the 30-tick telegraph (mirror status), then the
// arrows flip; the screen-edge shimmer is UI (L10).
import { defineItemVfx } from '../api.ts';

export default defineItemVfx({
  key: 'item.mirror_mode',
  use(fx, user) { if (user) { fx.ring(user.pos, '#B57CFF', 7, 0.5); fx.stars(user.pos, 8, '#B57CFF', 1.2); } },
});
