// Mutex Lock (team; classic item lock, P2): every opponent cannot use items for 150 ticks after a 21-tick lead.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'mutex_lock',
  teamOnly: true,
  category: 'utility',
  target: 'opponentsAll',
  applies: [{ effect: 'slot_lock', to: 'victim', leadTicks: 21 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  behavior: 'apply',
  priority: 'P2',
  ai: { use: 'always' },
  presentation: { iconKey: 'items/mutex_lock', vfxKey: 'item.mutex_lock', sfxUse: 'item.mutex_lock.use', nameKey: 'items.mutex_lock.name', descKey: 'items.mutex_lock.desc' },
});
