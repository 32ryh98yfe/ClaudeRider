// kart.rail_lock: metallic clack fm(600, 1.4, 5) 0.1 s + rising hum
import { defineSfx, env, osc, lp, sweep, fm } from '../lib.ts';

export default defineSfx({
  id: 'kart.rail_lock', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const c = env(ac, out, t0, 0.001, 0.1, 0, 0.02, 0.18 * G);
    fm(ac, 600 * P, 1.4, 5, t0, c.end, c.g);
    const h = env(ac, out, t0 + 0.04, 0.05, 0.3, 0, 0.05, 0.1 * G);
    const s = osc(ac, 'sawtooth', 110 * P, t0, h.end, lp(ac, 800, 1, h.g, t0));
    sweep(s.frequency, 110 * P, 180 * P, t0 + 0.04, 0.3);
    return Math.max(c.end, h.end);
  },
});
