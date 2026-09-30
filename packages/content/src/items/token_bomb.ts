// Token Bomb (KRD water-bomb role): 36-tick lob landing on the centreline 32 m ahead; traps everyone within 6.25 m, the thrower included.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'token_bomb',
  teamOnly: false,
  category: 'attack',
  target: 'lobAhead',
  lob: { flightTicks: 36, aheadM: 32, radius: 6.25, dy: 3, centerline: true },
  applies: [{ effect: 'trap_bomb', to: 'victim', leadTicks: 36 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'area',
  behavior: 'lob',
  ai: { use: 'targetAhead60' },
  presentation: { iconKey: 'items/token_bomb', vfxKey: 'item.token_bomb', sfxUse: 'item.token_bomb.use', sfxHit: 'item.token_bomb.hit', nameKey: 'items.token_bomb.name', descKey: 'items.token_bomb.desc' },
});
