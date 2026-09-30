// ui.purchase: coin-like FM ping
import { defineSfx, env, fm, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.purchase', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.001, 0.35, 0, 0.05, 0.12 * G);
    fm(ac, 1976 * P, 2, 1.5, t0, e.end, e.g);
    const b = tone(ac, out, 'sine', 2637 * P, t0 + 0.07, 0.3, 0.08 * G);
    return Math.max(e.end, b);
  },
});
