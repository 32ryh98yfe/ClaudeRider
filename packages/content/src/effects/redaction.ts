// Redaction Cloud overlay: opaque 120 ticks then 60 fade (UI); bots get perception noise.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'redaction',
  class: 'softCC',
  durTicks: 180,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { overlay: 'redaction' },
  nameKey: 'items.effect.redaction.name',
  presentation: { iconKey: 'effects/redaction', vfxKey: 'effect.redaction', sfxStart: 'item.redaction_cloud.hit', descKey: 'items.effect.redaction.desc' },
});
