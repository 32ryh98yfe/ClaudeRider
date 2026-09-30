// shield (§2.2.14): the window runs from the stamped use tick (lead 0) for durTicks; the status holds it, so the
// instance itself is not kept. Absorb handling lives in effects.resolveEffect (shield → halo → grace).
import type { EffectBehavior } from '../behavior.ts';

const behavior: EffectBehavior = {
  instant: true,
  onStart(w, e) {
    const st = w.karts[e.victim]!.status;
    if (e.end > st.shieldUntil) st.shieldUntil = e.end;
  },
};

export default behavior;
