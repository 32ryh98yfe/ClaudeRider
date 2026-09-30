// Mirror Mode: reversed steering.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'mirror',
  class: 'softCC',
  durTicks: 150,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { steerInvert: true, overlay: 'mirror' },
  nameKey: 'items.effect.mirror.name',
  presentation: { iconKey: 'effects/mirror', vfxKey: 'effect.mirror', sfxStart: 'item.mirror_mode.hit', descKey: 'items.effect.mirror.desc' },
});
