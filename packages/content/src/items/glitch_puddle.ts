// Glitch Puddle (KRD banana role): dropped 3 m behind, armed after 18 ticks, lives 1800; spins whoever drives over it.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'glitch_puddle',
  teamOnly: false,
  category: 'trap',
  target: 'dropBehind',
  drop: { behindM: 3, throwForwardM: 18, lifeTicks: 1800, armTicks: 18, radius: 1.3, maxPerOwner: 5, ownerImmuneTicks: 120 },
  applies: [{ effect: 'spin', to: 'victim', leadTicks: 0 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'area',
  behavior: 'drop',
  ai: { use: 'pursuerBehind15' },
  presentation: { iconKey: 'items/glitch_puddle', vfxKey: 'item.glitch_puddle', sfxUse: 'item.glitch_puddle.use', sfxHit: 'item.glitch_puddle.hit', nameKey: 'items.glitch_puddle.name', descKey: 'items.glitch_puddle.desc' },
});
