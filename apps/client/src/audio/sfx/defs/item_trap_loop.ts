// item.trap_loop: bubble wobble while trapped (1.5 s segment, re-triggered)
import { defineSfx, env, osc, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.trap_loop', bus: 'sfx', maxVoices: 2, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.05, 1.0, 0.8, 0.2, 0.09 * G, 0.3);
    const s = osc(ac, 'sine', 320 * P, t0, e.end, e.g);
    lfo(ac, s.frequency, 5, 60, t0, e.end);
    lfo(ac, e.g.gain, 3, 0.03 * G, t0, e.end);
    return e.end;
  },
});
