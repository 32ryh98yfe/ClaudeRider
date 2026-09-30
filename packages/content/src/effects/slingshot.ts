// Tether release: boost law toward 42.5 m/s (1.25 V_REF).
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'slingshot',
  class: 'buff',
  durTicks: 36,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { vTarget: 42.5 },
  nameKey: 'items.effect.slingshot.name',
  presentation: { iconKey: 'effects/slingshot', vfxKey: 'effect.slingshot', descKey: 'items.effect.slingshot.desc' },
});
