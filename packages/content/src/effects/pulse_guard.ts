// Interrupt Pulse guard: new throttle hits are refused (immune).
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'pulse_guard',
  class: 'defense',
  durTicks: 90,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: {},
  nameKey: 'items.effect.pulse_guard.name',
  presentation: { iconKey: 'effects/pulse_guard', vfxKey: 'effect.pulse_guard', sfxStart: 'item.interrupt_pulse.use', descKey: 'items.effect.pulse_guard.desc' },
});
