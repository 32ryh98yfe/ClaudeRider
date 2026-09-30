// Overclock Aura (KRD siren role): 180 ticks of boost; opponents within 2.2 m of the user are spun (once each per aura).
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'overclock_aura',
  teamOnly: false,
  category: 'speed',
  target: 'self',
  contact: { radius: 2.2 },
  applies: [{ effect: 'overclock', to: 'self', leadTicks: 0 }, { effect: 'spin', to: 'victim', leadTicks: 0 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  behavior: 'apply',
  ai: { use: 'straight' },
  presentation: { iconKey: 'items/overclock_aura', vfxKey: 'item.overclock_aura', sfxUse: 'item.overclock_aura.use', sfxHit: 'item.overclock_aura.hit', sfxLoop: 'item.overclock_aura.use', nameKey: 'items.overclock_aura.name', descKey: 'items.overclock_aura.desc' },
});
