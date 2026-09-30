// Context Shield: window from the stamped use tick; absorbs 1 hit, then 18 ticks of grace.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'shield',
  class: 'defense',
  durTicks: 180,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: {},
  behavior: 'shield',
  nameKey: 'items.effect.shield.name',
  presentation: { iconKey: 'effects/shield', vfxKey: 'effect.shield', sfxStart: 'item.context_shield.use', sfxEnd: 'item.context_shield.hit', descKey: 'items.effect.shield.desc' },
});
