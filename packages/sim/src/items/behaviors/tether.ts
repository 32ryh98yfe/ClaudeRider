// Attention Tether: needs an aim lock (else consumed, "조준 실패"); schedules tether_pull on the user with the hook
// flight as its lead (the fixed SCE lead of 21 ticks, so remote peers get the schedule before S). The target slot travels in the effect param (low 4 bits).
import type { ItemBehavior } from '../behavior.ts';
import { useOut } from '../behavior.ts';
import { DEFAULT_LEAD, applyTo } from '../applies.ts';
import { objectId } from '../ids.ts';
import { lockedTarget } from '../use.ts';

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    const target = lockedTarget(w.karts[user]!, def);
    if (target < 0) return 'fizzle';
    const seed = objectId(def.code, user, w.tick, 0);
    for (const a of def.applies) applyTo(w, ctx, def, a, user, user, a.leadTicks ?? DEFAULT_LEAD, seed, target + 16);
    useOut.target = target;
    return 'ok';
  },
};

export default behavior;
