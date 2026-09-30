// boost.stored: pop: sine 600 → 900 Hz 0.05 s
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'boost.stored', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.05, 0, 0.02, 0.2 * G);
    const s = osc(ac, 'sine', 600 * P, t0, e.end, e.g);
    sweep(s.frequency, 600 * P, 900 * P, t0, 0.05);
    return e.end;
  },
});
