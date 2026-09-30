// Token Bomb bubble: speed to 0 over 12 ticks; mash-out (-7 per alternating tap, floor 48); escape boost 30.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'trap_bomb',
  class: 'hardCC',
  durTicks: 132,
  stacking: 'refresh',
  immunityAfterTicks: 36,
  mods: { noControl: true, noItems: true, kinematic: 'trap' },
  mash: { creditTicks: 7, floorTicks: 48, maxCredits: 12, minGapTicks: 3 },
  onEnd: [{ effect: 'escape_boost', to: 'self', leadTicks: 0, durTicks: 30 }],
  nameKey: 'items.effect.trap_bomb.name',
  presentation: { iconKey: 'effects/trap_bomb', vfxKey: 'effect.trap_bomb', sfxStart: 'item.token_bomb.hit', sfxLoop: 'item.trap_loop', sfxEnd: 'item.escape_pop', descKey: 'items.effect.trap_bomb.desc' },
});
