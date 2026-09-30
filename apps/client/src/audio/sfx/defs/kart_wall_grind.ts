// kart.wall_grind: brown noise lp 900 Hz + metallic partials fm(420, 2.7, 3), gain by tangent speed (k)
import { defineSfx, env, noise, lp, fm } from '../lib.ts';

export default defineSfx({
  id: 'kart.wall_grind', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.16, 0.5, 0.06, 0.22 * G * (0.4 + 0.6 * k), 0.05);
    noise(ac, o.noise, 'brown', t0, e.end, lp(ac, 900, 0.7, e.g, t0));
    const m = env(ac, out, t0, 0.005, 0.12, 0, 0.04, 0.06 * G);
    fm(ac, 420 * P, 2.7, 3, t0, m.end, m.g);
    return Math.max(e.end, m.end);
  },
});
