// haz.train: horn (two detuned squares 300/370 Hz) + rumble
import { defineSfx, env, osc, noise, lp } from '../lib.ts';

export default defineSfx({
  id: 'haz.train', bus: 'sfx', maxVoices: 2, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.05, 1.0, 0.8, 0.3, 0.07 * G, 0.4);
    const f = lp(ac, 1800, 0.8, e.g, t0);
    osc(ac, 'square', 300 * P, t0, e.end, f); osc(ac, 'square', 370 * P, t0, e.end, f);
    const r = env(ac, out, t0, 0.2, 1.4, 0.6, 0.3, 0.25 * G, 0.3);
    noise(ac, o.noise, 'brown', t0, r.end, lp(ac, 200, 0.7, r.g, t0));
    return Math.max(e.end, r.end);
  },
});
