// Mutex Lock: item use refused (pickups are still allowed).
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'slot_lock',
  class: 'softCC',
  durTicks: 150,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { noItems: true },
  nameKey: 'items.effect.slot_lock.name',
  presentation: { iconKey: 'effects/slot_lock', vfxKey: 'effect.slot_lock', sfxStart: 'item.mutex_lock.use', descKey: 'items.effect.slot_lock.desc' },
});
