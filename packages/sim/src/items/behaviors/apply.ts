// Generic instant-delivery behaviour: applies[] to self / team / every opponent ahead / every opponent, each with its
// SCE lead (Turbo, Overclock, Shield, Halo, Lens, Broadcast Bolt, Mirror Mode, Mutex Lock). `to: 'victim'` entries of a
// 'self' item (the Overclock spin) are delivered by contact, not here.
import type { ItemBehavior } from '../behavior.ts';
import { useOut } from '../behavior.ts';
import { DEFAULT_LEAD, applyTo } from '../applies.ts';
import { objectId } from '../ids.ts';
import { canAffect, inRace, sameTeam } from '../team.ts';
import { NO_TARGET } from '../codes.ts';

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    const k = w.karts[user]!;
    const seed = objectId(def.code, user, w.tick, 0);
    let victims = 0, last = NO_TARGET as number;
    for (const a of def.applies) {
      const lead = a.leadTicks ?? DEFAULT_LEAD;
      if (a.to === 'self') { applyTo(w, ctx, def, a, user, user, lead, seed, 0); continue; }
      if (a.to === 'team') {
        applyTo(w, ctx, def, a, user, user, 0, seed, 0); // the user's own copy starts at T (§2.2.16)
        for (const o of w.karts) if (o.slot !== user && inRace(o) && sameTeam(ctx, k, o)) applyTo(w, ctx, def, a, user, o.slot, lead, seed, 0);
        continue;
      }
      if (def.target !== 'allAheadOpponents' && def.target !== 'opponentsAll') continue;
      for (const o of w.karts) {
        if (!inRace(o) || !canAffect(ctx, k, o, def)) continue;
        if (def.target === 'allAheadOpponents' && o.race.raceDist <= k.race.raceDist) continue;
        applyTo(w, ctx, def, a, user, o.slot, lead, seed, 0);
        victims++; last = o.slot;
      }
      if (victims === 0) return 'fizzle';
    }
    useOut.target = victims === 1 ? last : NO_TARGET;
    return 'ok';
  },
};

export default behavior;
