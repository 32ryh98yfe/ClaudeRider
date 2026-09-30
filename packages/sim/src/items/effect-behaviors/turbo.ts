// turbo (§2.2.1): the Turbo Token writes the kart's boost timer like a gauge booster (boost law toward vBoost):
// remaining = min(remaining + dur, capTicks), boostKind = item. Instant: nothing stays in the effect list.
import { Boost } from '../../core/state.ts';
import { evKey } from '../../kart/evkey.ts';
import type { EffectBehavior } from '../behavior.ts';
import { effectDef } from '../codes.ts';

const behavior: EffectBehavior = {
  instant: true,
  onStart(w, e, ctx) {
    const k = w.karts[e.victim]!, d = k.drive;
    const cap = effectDef(ctx.content, e.code)?.capTicks ?? 270;
    // set outside kart dynamics (which decrements first), so the timer holds remaining + 1 (10-sim-spec §1.3)
    const remaining = d.boostTicks > 0 ? d.boostTicks - 1 : 0;
    let next = remaining + (e.end - e.start);
    if (next > cap) next = cap;
    d.boostTicks = next + 1;
    d.boostKind = Boost.ITEM;
    ctx.events.push({ t: 'boostStart', kart: k.slot, kind: Boost.ITEM, tick: w.tick, key: evKey(w.tick, 91, k.slot, 0) });
  },
};

export default behavior;
