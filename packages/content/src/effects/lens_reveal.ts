// Interpretability Lens: the standings show the rival team held items (UI only).
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'lens_reveal',
  class: 'buff',
  durTicks: 600,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: {},
  nameKey: 'items.effect.lens_reveal.name',
  presentation: { iconKey: 'effects/lens_reveal', vfxKey: 'effect.lens_reveal', sfxStart: 'item.interpretability_lens.use', descKey: 'items.effect.lens_reveal.desc' },
});
