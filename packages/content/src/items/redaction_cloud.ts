// Redaction Cloud (classic dark-cloud role): a 10 m ink sphere dropped behind; each kart entering it gets the redaction overlay once.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'redaction_cloud',
  teamOnly: false,
  category: 'trap',
  target: 'dropBehind',
  drop: { behindM: 3, lifeTicks: 600, armTicks: 18, radius: 10, maxPerOwner: 2, heightM: 2 },
  applies: [{ effect: 'redaction', to: 'victim', leadTicks: 0 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  behavior: 'drop',
  ai: { use: 'pursuerBehind15' },
  presentation: { iconKey: 'items/redaction_cloud', vfxKey: 'item.redaction_cloud', sfxUse: 'item.redaction_cloud.use', sfxHit: 'item.redaction_cloud.hit', nameKey: 'items.redaction_cloud.name', descKey: 'items.redaction_cloud.desc' },
});
