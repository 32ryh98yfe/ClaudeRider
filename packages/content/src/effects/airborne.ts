// Missile hit: kinematic launch (visual lift peaks 4.0 m at tick 33), horizontal speed eased to x0.25 of the impact speed, then a 60-tick recovery boost.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'airborne',
  class: 'hardCC',
  durTicks: 66,
  stacking: 'refresh',
  immunityAfterTicks: 36,
  mods: { noControl: true, noItems: true, kinematic: 'airborne' },
  onEnd: [{ effect: 'escape_boost', to: 'self', leadTicks: 0, durTicks: 60 }],
  nameKey: 'items.effect.airborne.name',
  presentation: { iconKey: 'effects/airborne', vfxKey: 'effect.airborne', sfxStart: 'item.prompt_missile.hit', descKey: 'items.effect.airborne.desc' },
});
