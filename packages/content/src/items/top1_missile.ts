// Top-1 Missile: homes on the leader at 1.9 V_REF; fizzles (consumed) if the leader is the user or a teammate.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'top1_missile',
  teamOnly: false,
  category: 'attack',
  target: 'leader',
  projectile: { speedMulVref: 1.9, plusTargetSpeed: 0, lifeTicks: 1800, passWalls: true, route: 'spline' },
  applies: [{ effect: 'airborne', to: 'victim', leadTicks: 21 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  validity: 'notIfLeaderSelfOrTeam',
  behavior: 'projectile',
  ai: { use: 'rank3plus' },
  presentation: { iconKey: 'items/top1_missile', vfxKey: 'item.top1_missile', sfxUse: 'item.top1_missile.use', sfxHit: 'item.prompt_missile.hit', nameKey: 'items.top1_missile.name', descKey: 'items.top1_missile.desc' },
});
