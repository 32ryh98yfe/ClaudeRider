// Turbo Token (KRD booster role): boost like a gauge booster for 180 ticks (capped at 270 remaining).
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'turbo_token',
  teamOnly: false,
  category: 'speed',
  target: 'self',
  applies: [{ effect: 'turbo', to: 'self', leadTicks: 0 }],
  blockedBy: [],
  friendlyFire: 'never',
  behavior: 'apply',
  ai: { use: 'straight' },
  presentation: { iconKey: 'items/turbo_token', vfxKey: 'item.turbo_token', sfxUse: 'item.turbo_token.use', nameKey: 'items.turbo_token.name', descKey: 'items.turbo_token.desc' },
});
