// Firewall block hit: on start forward speed x0.35 and a 3 m/s bounce along the block normal; acceleration x0.5.
import { defineEffect } from '../define.ts';

export default defineEffect({
  id: 'firewall_hit',
  class: 'softCC',
  durTicks: 24,
  stacking: 'refresh',
  immunityAfterTicks: 0,
  mods: { accelMul: 0.5 },
  behavior: 'firewall_hit',
  nameKey: 'items.effect.firewall_hit.name',
  presentation: { iconKey: 'effects/firewall_hit', vfxKey: 'effect.firewall_hit', sfxStart: 'item.firewall.hit', descKey: 'items.effect.firewall_hit.desc' },
});
