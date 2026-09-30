// halo (§2.2.16): like the shield, one absorb per teammate within durTicks; held in KartStatus.haloUntil.
import type { EffectBehavior } from '../behavior.ts';

const behavior: EffectBehavior = {
  instant: true,
  onStart(w, e) {
    const st = w.karts[e.victim]!.status;
    if (e.end > st.haloUntil) st.haloUntil = e.end;
  },
};

export default behavior;
