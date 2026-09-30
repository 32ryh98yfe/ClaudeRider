// Interrupt Pulse "^C" (KRD EMP role): clears drones (also in flight) and opponent tethers on the user (and teammates), then 90 ticks of drone immunity.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'interrupt_pulse',
  teamOnly: false,
  category: 'defense',
  target: 'team',
  applies: [{ effect: 'pulse_guard', to: 'team', leadTicks: 0 }],
  blockedBy: [],
  friendlyFire: 'never',
  behavior: 'pulse',
  ai: { use: 'onDrone' },
  presentation: { iconKey: 'items/interrupt_pulse', vfxKey: 'item.interrupt_pulse', sfxUse: 'item.interrupt_pulse.use', nameKey: 'items.interrupt_pulse.name', descKey: 'items.interrupt_pulse.desc' },
});
