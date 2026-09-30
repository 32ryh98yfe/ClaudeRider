// Bug Report bubble: same as trap_bomb with 84 ticks; reaches the 48-tick floor after 6 credits.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'trap_bug',
  class: 'hardCC',
  durTicks: 84,
  stacking: 'refresh',
  immunityAfterTicks: 36,
  mods: { noControl: true, noItems: true, kinematic: 'trap' },
  mash: { creditTicks: 7, floorTicks: 48, maxCredits: 12, minGapTicks: 3 },
  onEnd: [{ effect: 'escape_boost', to: 'self', leadTicks: 0, durTicks: 30 }],
  nameKey: 'items.effect.trap_bug.name',
  presentation: { iconKey: 'effects/trap_bug', vfxKey: 'effect.trap_bug', sfxStart: 'item.bug_report.hit', sfxLoop: 'item.trap_loop', sfxEnd: 'item.escape_pop', descKey: 'items.effect.trap_bug.desc' },
});
