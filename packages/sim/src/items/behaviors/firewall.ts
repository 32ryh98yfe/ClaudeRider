// Firewall: blocks 45 m ahead of the leader (solo) / the highest-ranked opponent (team). Fizzles when the user is that
// kart (the validity reroll normally prevents rolling it then).
import type { ItemBehavior } from '../behavior.ts';
import { useOut } from '../behavior.ts';
import { placeFirewall } from '../hazards.ts';
import { firewallTarget } from '../team.ts';

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    const target = firewallTarget(w, ctx, w.karts[user]!);
    if (target < 0 || !def.place || !def.drop) return 'fizzle';
    useOut.obj = placeFirewall(w, ctx, def, user, target);
    useOut.target = target;
    return 'ok';
  },
};

export default behavior;
