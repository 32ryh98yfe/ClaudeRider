// Alignment Halo (team; KRD angel role): every teammate absorbs one hit; the user at T, teammates at T + 21.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'alignment_halo',
  teamOnly: true,
  category: 'defense',
  target: 'team',
  applies: [{ effect: 'halo', to: 'team', leadTicks: 21 }],
  blockedBy: [],
  friendlyFire: 'never',
  behavior: 'apply',
  ai: { use: 'incomingThreat' },
  presentation: { iconKey: 'items/alignment_halo', vfxKey: 'item.alignment_halo', sfxUse: 'item.alignment_halo.use', nameKey: 'items.alignment_halo.name', descKey: 'items.alignment_halo.desc' },
});
