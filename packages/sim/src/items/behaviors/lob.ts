// Token Bomb: a lobbed hazard landing on the centreline ahead after `lob.flightTicks` (the flight is the lead).
import type { ItemBehavior } from '../behavior.ts';
import { useOut } from '../behavior.ts';
import { lobAhead } from '../hazards.ts';

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    if (!def.lob) return 'fizzle';
    useOut.obj = lobAhead(w, ctx, def, user).id;
    return 'ok';
  },
};

export default behavior;
