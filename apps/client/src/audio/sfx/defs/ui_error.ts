// ui.error: low buzz 150 Hz 0.15 s
import { defineSfx, env, osc, lp } from '../lib.ts';

export default defineSfx({
  id: 'ui.error', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.005, 0.15, 0.7, 0.03, 0.1 * G, 0.05);
    osc(ac, 'square', 150 * P, t0, e.end, lp(ac, 900, 0.7, e.g, t0));
    return e.end;
  },
});
