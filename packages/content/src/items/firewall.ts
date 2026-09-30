// Firewall (KRD barricade role): 3 burning blocks 45 m ahead of the leader (solo) or the highest-ranked opponent (team), armed after 24 ticks.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'firewall',
  teamOnly: false,
  category: 'trap',
  target: 'aheadOfLeader',
  drop: { behindM: 0, lifeTicks: 900, armTicks: 24, radius: 1.3, maxPerOwner: 3 },
  place: { aheadM: 45, offsets: [-3, 0, 3], minWidthM: 8, edgeM: 1.5, blockHeightM: 1.2 },
  applies: [{ effect: 'firewall_hit', to: 'victim', leadTicks: 0 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'area',
  behavior: 'firewall',
  ai: { use: 'rank3plus' },
  presentation: { iconKey: 'items/firewall', vfxKey: 'item.firewall', sfxUse: 'item.firewall.use', sfxHit: 'item.firewall.hit', nameKey: 'items.firewall.name', descKey: 'items.firewall.desc' },
});
