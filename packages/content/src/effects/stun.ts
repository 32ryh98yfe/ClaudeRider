// Broadcast Bolt shock: no control, cap 0.5 V_REF, then post_stun_slow.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'stun',
  class: 'hardCC',
  durTicks: 54,
  stacking: 'refresh',
  immunityAfterTicks: 36,
  mods: { noControl: true, noItems: true, vCapMul: 0.5 },
  onEnd: [{ effect: 'post_stun_slow', to: 'self', leadTicks: 0 }],
  nameKey: 'items.effect.stun.name',
  presentation: { iconKey: 'effects/stun', vfxKey: 'effect.stun', sfxStart: 'item.stun_zap', descKey: 'items.effect.stun.desc' },
});
