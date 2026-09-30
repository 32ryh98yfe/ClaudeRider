// Spin-out: speed eased to x0.45 over 20 ticks, velocity direction kept; the model spins 2 turns (render only).
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'spin',
  class: 'hardCC',
  durTicks: 60,
  stacking: 'refresh',
  immunityAfterTicks: 36,
  mods: { noControl: true, noItems: true, kinematic: 'spin' },
  nameKey: 'items.effect.spin.name',
  presentation: { iconKey: 'effects/spin', vfxKey: 'effect.spin', sfxStart: 'item.spin', descKey: 'items.effect.spin.desc' },
});
