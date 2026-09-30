// Lingering slow after a stun: cap 0.8 V_REF.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'post_stun_slow',
  class: 'softCC',
  durTicks: 48,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { vCapMul: 0.8 },
  nameKey: 'items.effect.post_stun_slow.name',
  presentation: { iconKey: 'effects/post_stun_slow', vfxKey: 'effect.post_stun_slow', descKey: 'items.effect.post_stun_slow.desc' },
});
