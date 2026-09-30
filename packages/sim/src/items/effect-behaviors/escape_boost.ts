// escape_boost (§6.4): after a trap or airborne, the instant-boost law (floor 9 m/s² toward 1.05·vGrip) for durTicks.
import type { EffectBehavior } from '../behavior.ts';

const behavior: EffectBehavior = {
  instant: true,
  onStart(w, e) {
    const d = w.karts[e.victim]!.drive;
    // resolved in phase 2, before dynamics decrement the timer: dur + 1 keeps it active for exactly dur ticks
    const t = e.end - e.start + 1;
    if (t > d.instTicks) d.instTicks = t;
  },
};

export default behavior;
