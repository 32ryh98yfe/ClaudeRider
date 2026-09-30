// Homing projectiles: Prompt Missile (aim lock, front or rear), Top-1 Missile and Throttle Drone (leader, fizzle if the
// leader is the user or a teammate), Bug Report (the opponent directly ahead). No valid target → consumed, fizzle.
import type { ItemBehavior } from '../behavior.ts';
import { useOut } from '../behavior.ts';
import { spawnProjectile } from '../projectiles.ts';
import { leaderTarget, nextAheadOpponent } from '../team.ts';
import { lockedTarget } from '../use.ts';

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    const k = w.karts[user]!;
    let target = -1;
    if (def.target === 'aim') target = lockedTarget(k, def);
    else if (def.target === 'leader') target = leaderTarget(w, ctx, k);
    else if (def.target === 'nextAheadOpponent') target = nextAheadOpponent(w, ctx, k, def);
    if (target < 0 || !def.projectile) return 'fizzle';
    const p = spawnProjectile(w, ctx, def, user, target);
    useOut.obj = p.id; useOut.target = target;
    return 'ok';
  },
};

export default behavior;
