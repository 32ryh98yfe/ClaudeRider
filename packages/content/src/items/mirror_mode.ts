// Mirror Mode (classic devil role): every opponent ahead gets reversed steering after a 30-tick telegraph.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'mirror_mode',
  teamOnly: false,
  category: 'attack',
  target: 'allAheadOpponents',
  applies: [{ effect: 'mirror', to: 'victim', leadTicks: 30 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  behavior: 'apply',
  ai: { use: 'rank3plus' },
  presentation: { iconKey: 'items/mirror_mode', vfxKey: 'item.mirror_mode', sfxUse: 'item.mirror_mode.use', sfxHit: 'item.mirror_mode.hit', nameKey: 'items.mirror_mode.name', descKey: 'items.mirror_mode.desc' },
});
