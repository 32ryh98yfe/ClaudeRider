// Overclock Aura: boost law toward the kart vBoost; immune to spin; spins opponents within 2.2 m (once each).
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'overclock',
  class: 'buff',
  durTicks: 180,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { vTargetKartBoost: true },
  nameKey: 'items.effect.overclock.name',
  presentation: { iconKey: 'effects/overclock', vfxKey: 'effect.overclock', sfxStart: 'item.overclock_aura.use', sfxLoop: 'item.overclock_aura.use', descKey: 'items.effect.overclock.desc' },
});
