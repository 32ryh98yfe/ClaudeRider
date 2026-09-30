// Attention Tether pull on the user: pursuit toward the target, boost law to max(40.8, min(1.25 u_target, 44.4)); the slingshot follows only when ended by proximity (4 m).
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'tether_pull',
  class: 'buff',
  durTicks: 132,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { kinematic: 'tether' },
  onEnd: [{ effect: 'slingshot', to: 'self', leadTicks: 0 }],
  behavior: 'tether',
  nameKey: 'items.effect.tether_pull.name',
  presentation: { iconKey: 'effects/tether_pull', vfxKey: 'effect.tether_pull', sfxStart: 'item.attention_tether.hit', descKey: 'items.effect.tether_pull.desc' },
});
