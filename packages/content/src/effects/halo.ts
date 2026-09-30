// Alignment Halo: absorbs 1 hit per teammate; same exceptions as the shield.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'halo',
  class: 'defense',
  durTicks: 210,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: {},
  behavior: 'halo',
  nameKey: 'items.effect.halo.name',
  presentation: { iconKey: 'effects/halo', vfxKey: 'effect.halo', sfxStart: 'item.alignment_halo.use', sfxEnd: 'item.context_shield.hit', descKey: 'items.effect.halo.desc' },
});
