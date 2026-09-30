// Attention Tether (KRD magnet role): 21-tick hook (the fixed ADR-007 SCE lead; spec §2.2.2 said 12), then the user is pulled toward the locked target. Unblockable; cleared by the target side's Interrupt Pulse.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'attention_tether',
  teamOnly: false,
  category: 'speed',
  target: 'aim',
  aim: { coneDeg: 18, rangeMin: 25, rangeMax: 150, lockTicks: 21, allowRear: false, allowTeam: true },
  applies: [{ effect: 'tether_pull', to: 'self', leadTicks: 21 }],
  blockedBy: [],
  clearedBy: ['pulse'],
  friendlyFire: 'never',
  behavior: 'tether',
  ai: { use: 'targetAhead60' },
  presentation: { iconKey: 'items/attention_tether', vfxKey: 'item.attention_tether', sfxUse: 'item.attention_tether.use', sfxHit: 'item.attention_tether.hit', nameKey: 'items.attention_tether.name', descKey: 'items.attention_tether.desc' },
});
