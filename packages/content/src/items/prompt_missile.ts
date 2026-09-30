// Prompt Missile: homing projectile on the spline route at max(1.9 V_REF, u_target + 20); terminal commit at ETA <= 21 ticks.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'prompt_missile',
  teamOnly: false,
  category: 'attack',
  target: 'aim',
  aim: { coneDeg: 20, rangeMin: 10, rangeMax: 180, lockTicks: 30, allowRear: true },
  projectile: { speedMulVref: 1.9, plusTargetSpeed: 20, lifeTicks: 600, passWalls: true, route: 'spline' },
  applies: [{ effect: 'airborne', to: 'victim', leadTicks: 21 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  behavior: 'projectile',
  ai: { use: 'targetAhead60' },
  presentation: { iconKey: 'items/prompt_missile', vfxKey: 'item.prompt_missile', sfxUse: 'item.prompt_missile.use', sfxHit: 'item.prompt_missile.hit', nameKey: 'items.prompt_missile.name', descKey: 'items.prompt_missile.desc' },
});
