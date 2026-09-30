// Bug Report (KRD water-fly role): homing projectile at 2.35 V_REF onto the opponent directly ahead in rank.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'bug_report',
  teamOnly: false,
  category: 'attack',
  target: 'nextAheadOpponent',
  projectile: { speedMulVref: 2.35, plusTargetSpeed: 0, lifeTicks: 600, passWalls: true, route: 'spline' },
  applies: [{ effect: 'trap_bug', to: 'victim', leadTicks: 21 }],
  blockedBy: ['shield', 'halo'],
  friendlyFire: 'never',
  behavior: 'projectile',
  ai: { use: 'always' },
  presentation: { iconKey: 'items/bug_report', vfxKey: 'item.bug_report', sfxUse: 'item.bug_report.use', sfxHit: 'item.bug_report.hit', nameKey: 'items.bug_report.name', descKey: 'items.bug_report.desc' },
});
