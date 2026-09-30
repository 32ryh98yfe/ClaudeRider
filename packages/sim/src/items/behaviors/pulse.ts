// Interrupt Pulse "^C" (§2.2.15): instant at T for the user (solo) or the user and every teammate. Data-driven by
// ItemDef.clearedBy = ['pulse'] (Throttle Drone, Attention Tether):
// - projectiles of those items targeting a protected kart are removed (drones in flight);
// - their `to: 'victim'` effects on protected karts are removed (throttle stacks);
// - their `to: 'self'` effects whose target is protected and whose owner is an opponent end without onEnd (opponent
//   tethers; a teammate's tether is not broken [S]).
// Then pulse_guard (new drone hits are refused).
import type { ContentTables } from '@cr/content';
import type { ItemBehavior } from '../behavior.ts';
import { DEFAULT_LEAD, applyTo } from '../applies.ts';
import { EF, EFlag } from '../codes.ts';
import { compactEffects, kill } from '../effects.ts';
import { objectId } from '../ids.ts';
import { clearProjectiles } from '../projectiles.ts';
import { inRace, sameTeam } from '../team.ts';
import { tetherTarget } from '../effect-behaviors/tether.ts';

interface Cleared { items: number[]; victimFx: number[]; selfFx: number[] }
const CACHE = new WeakMap<ContentTables, Cleared>();
function clearedByPulse(c: ContentTables): Cleared {
  let r = CACHE.get(c);
  if (!r) {
    r = { items: [], victimFx: [], selfFx: [] };
    for (const d of c.items.all) {
      if (!d.clearedBy?.includes('pulse')) continue;
      r.items.push(d.code);
      for (const a of d.applies) (a.to === 'victim' ? r.victimFx : r.selfFx).push(EF[a.effect]);
    }
    CACHE.set(c, r);
  }
  return r;
}

const behavior: ItemBehavior = {
  onUse(w, user, def, ctx) {
    const k = w.karts[user]!;
    let mask = 1 << user;
    for (const o of w.karts) if (o.slot !== user && inRace(o) && sameTeam(ctx, k, o)) mask |= 1 << o.slot;
    const cl = clearedByPulse(ctx.content);
    for (const e of w.effects) {
      if ((e.flags & EFlag.DEAD) !== 0) continue;
      let hit = false;
      if (cl.victimFx.includes(e.code)) hit = (mask & (1 << e.victim)) !== 0;
      else if (cl.selfFx.includes(e.code)) {
        const puller = w.karts[e.victim]!;
        hit = (mask & (1 << tetherTarget(e))) !== 0 && puller.slot !== user && !sameTeam(ctx, k, puller);
      }
      if (!hit) continue;
      if ((e.flags & EFlag.RESOLVED) !== 0) e.flags = (e.flags | EFlag.ENDED) & ~EFlag.PROXIMITY; else kill(e);
    }
    compactEffects(w);
    clearProjectiles(w, ctx, mask, cl.items);
    const seed = objectId(def.code, user, w.tick, 0);
    for (const a of def.applies) {
      applyTo(w, ctx, def, a, user, user, 0, seed, 0);
      if (a.to === 'team') for (const o of w.karts) if (o.slot !== user && (mask & (1 << o.slot)) !== 0) applyTo(w, ctx, def, a, user, o.slot, a.leadTicks ?? DEFAULT_LEAD, seed, 0);
    }
    return 'ok';
  },
};

export default behavior;
