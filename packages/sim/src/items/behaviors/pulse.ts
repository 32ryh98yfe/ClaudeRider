// Interrupt Pulse "^C" (§2.2.15): instant at T for the user (solo) or the user and every teammate: removes throttle
// stacks and drones targeting them (also in flight), ends every opponent tether_pull whose target is one of them (no
// slingshot), then grants pulse_guard (new drone hits are refused).
import type { ItemBehavior } from '../behavior.ts';
import { DEFAULT_LEAD, applyTo } from '../applies.ts';
import { EF, EFlag } from '../codes.ts';
import { compactEffects, kill } from '../effects.ts';
import { objectId } from '../ids.ts';
import { clearDrones } from '../projectiles.ts';
import { inRace, sameTeam } from '../team.ts';
import { tetherTarget } from '../effect-behaviors/tether.ts';

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    const k = w.karts[user]!;
    let mask = 1 << user;
    for (const o of w.karts) if (o.slot !== user && inRace(o) && sameTeam(ctx, k, o)) mask |= 1 << o.slot;
    for (const e of w.effects) {
      if ((e.flags & EFlag.DEAD) !== 0) continue;
      if (e.code === EF.throttle && (mask & (1 << e.victim)) !== 0) {
        if ((e.flags & EFlag.RESOLVED) !== 0) e.flags |= EFlag.ENDED; else kill(e);
      } else if (e.code === EF.tether_pull && (mask & (1 << tetherTarget(e))) !== 0) {
        const puller = w.karts[e.victim]!;
        if (puller.slot === user || sameTeam(ctx, k, puller)) continue; // a teammate's tether is not broken
        if ((e.flags & EFlag.RESOLVED) !== 0) e.flags = (e.flags | EFlag.ENDED) & ~EFlag.PROXIMITY; else kill(e);
      }
    }
    compactEffects(w);
    clearDrones(w, ctx, mask);
    const seed = objectId(def.code, user, w.tick, 0);
    for (const a of def.applies) {
      applyTo(w, ctx, def, a, user, user, 0, seed, 0);
      if (a.to === 'team') for (const o of w.karts) if (o.slot !== user && (mask & (1 << o.slot)) !== 0) applyTo(w, ctx, def, a, user, o.slot, a.leadTicks ?? DEFAULT_LEAD, seed, 0);
    }
    return 'ok';
  },
};

export default behavior;
