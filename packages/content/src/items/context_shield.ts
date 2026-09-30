// Context Shield: 180-tick window from the stamped use tick; absorbs one hit (not drones or tethers), then 18 ticks of grace.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'context_shield',
  teamOnly: false,
  category: 'defense',
  target: 'self',
  applies: [{ effect: 'shield', to: 'self', leadTicks: 0 }],
  blockedBy: [],
  friendlyFire: 'never',
  behavior: 'apply',
  ai: { use: 'incomingThreat' },
  presentation: { iconKey: 'items/context_shield', vfxKey: 'item.context_shield', sfxUse: 'item.context_shield.use', sfxHit: 'item.context_shield.hit', nameKey: 'items.context_shield.name', descKey: 'items.context_shield.desc' },
});
