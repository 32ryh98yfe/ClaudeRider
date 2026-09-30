// Throttle Drone "429" (KRD UFO role): fixed 72-tick flight to the leader, commit at T + 51; unblockable, cleared only by Interrupt Pulse.
import { defineItem } from '../define.ts';

export default defineItem({
  id: 'throttle_drone',
  teamOnly: false,
  category: 'attack',
  target: 'leader',
  projectile: { speedMulVref: 0, plusTargetSpeed: 0, lifeTicks: 72, passWalls: true, route: 'direct' },
  applies: [{ effect: 'throttle', to: 'victim', leadTicks: 21 }],
  blockedBy: [],
  clearedBy: ['pulse'],
  friendlyFire: 'never',
  validity: 'notIfLeaderSelfOrTeam',
  behavior: 'projectile',
  ai: { use: 'rank3plus' },
  presentation: { iconKey: 'items/throttle_drone', vfxKey: 'item.throttle_drone', sfxUse: 'item.throttle_drone.use', sfxLoop: 'item.throttle_drone.loop', nameKey: 'items.throttle_drone.name', descKey: 'items.throttle_drone.desc' },
});
