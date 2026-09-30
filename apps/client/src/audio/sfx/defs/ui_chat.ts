// ui.chat: bubble blip
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'ui.chat', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.07, 0, 0.02, 0.1 * G);
    const s = osc(ac, 'sine', 900 * P, t0, e.end, e.g);
    sweep(s.frequency, 600 * P, 1300 * P, t0, 0.07);
    return e.end;
  },
});
