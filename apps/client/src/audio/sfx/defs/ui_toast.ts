// ui.toast: soft pop
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'ui.toast', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.06, 0, 0.02, 0.12 * G);
    const s = osc(ac, 'sine', 700 * P, t0, e.end, e.g);
    sweep(s.frequency, 700 * P, 1100 * P, t0, 0.05);
    return e.end;
  },
});
