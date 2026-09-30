// Dropped hazards behind the user (Glitch Puddle, Redaction Cloud). Items dropped inside a noItem zone fizzle (§4.3).
import type { ItemBehavior } from '../behavior.ts';
import { useOut } from '../behavior.ts';
import { dropBehind, inNoItemZone } from '../hazards.ts';

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    if (!def.drop || inNoItemZone(ctx, w.karts[user]!)) return 'fizzle';
    const h = dropBehind(w, ctx, def, user);
    if (!h) return 'fizzle';
    useOut.obj = h.id;
    return 'ok';
  },
};

export default behavior;
