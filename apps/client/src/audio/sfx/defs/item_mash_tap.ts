// item.mash_tap: tiny pop per credited tap (pitch rises with credits, k)
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'item.mash_tap', bus: 'ui', maxVoices: 3, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.001, 0.04, 0, 0.01, 0.16 * G);
    const s = osc(ac, 'sine', (500 + 500 * k) * P, t0, e.end, e.g);
    sweep(s.frequency, (500 + 500 * k) * P, (800 + 600 * k) * P, t0, 0.04);
    return e.end;
  },
});
