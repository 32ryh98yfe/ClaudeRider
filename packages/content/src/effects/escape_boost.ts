// Instant-boost law after a trap or airborne: writes instTicks = durTicks.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'escape_boost',
  class: 'buff',
  durTicks: 30,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: {},
  behavior: 'escape_boost',
  nameKey: 'items.effect.escape_boost.name',
  presentation: { iconKey: 'effects/escape_boost', vfxKey: 'effect.escape_boost', descKey: 'items.effect.escape_boost.desc' },
});
