// Turbo Token: writes boostTicks (+180, capped at 270 remaining), boostKind = item.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'turbo',
  class: 'buff',
  durTicks: 180,
  stacking: 'extend',
  immunityAfterTicks: 0,
  mods: {},
  capTicks: 270,
  behavior: 'turbo',
  nameKey: 'items.effect.turbo.name',
  presentation: { iconKey: 'effects/turbo', vfxKey: 'effect.turbo', sfxStart: 'item.turbo_token.use', descKey: 'items.effect.turbo.desc' },
});
