// Throttle Drone "429": each stack is an independent (start, end) pair, at most 3 concurrent; cap (0.60 - 0.08 (n - 1)) V_REF.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'throttle',
  class: 'softCC',
  durTicks: 210,
  stacking: 'stackDuration3',
  immunityAfterTicks: 0,
  mods: { vCapMul: 0.6, vCapStep: 0.08, gaugeMul: 0.5 },
  nameKey: 'items.effect.throttle.name',
  presentation: { iconKey: 'effects/throttle', vfxKey: 'effect.throttle', sfxStart: 'item.throttle_drone.hit', sfxLoop: 'item.throttle_drone.loop', descKey: 'items.effect.throttle.desc' },
});
