// Broadcast Bolt (KRD thunderbolt role): every opponent ahead is stunned after a 21-tick telegraph.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'broadcast_bolt',
  teamOnly: false,
  category: 'attack',
  target: 'allAheadOpponents',
  applies: [{ effect: 'stun', to: 'victim', leadTicks: 21 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  behavior: 'apply',
  ai: { use: 'rank3plus' },
  presentation: { iconKey: 'items/broadcast_bolt', vfxKey: 'item.broadcast_bolt', sfxUse: 'item.broadcast_bolt.use', nameKey: 'items.broadcast_bolt.name', descKey: 'items.broadcast_bolt.desc' },
});
