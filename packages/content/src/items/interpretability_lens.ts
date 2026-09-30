// Interpretability Lens (team; KRD scanner role, P2): the standings show the rival team held items for 600 ticks.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'interpretability_lens',
  teamOnly: true,
  category: 'utility',
  target: 'team',
  applies: [{ effect: 'lens_reveal', to: 'team', leadTicks: 0 }],
  blockedBy: [],
  friendlyFire: 'never',
  behavior: 'apply',
  priority: 'P2',
  ai: { use: 'always' },
  presentation: { iconKey: 'items/interpretability_lens', vfxKey: 'item.interpretability_lens', sfxUse: 'item.interpretability_lens.use', nameKey: 'items.interpretability_lens.name', descKey: 'items.interpretability_lens.desc' },
});
