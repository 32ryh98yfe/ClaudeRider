// haz.geyser: pressure hiss → roar
import { defineSfx, env, noise, lp, hp } from '../lib.ts';

export default defineSfx({
  id: 'haz.geyser', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const h = env(ac, out, t0, 0.3, 0.5, 0.8, 0.3, 0.12 * G, 0.4);
    noise(ac, o.noise, 'white', t0, h.end, hp(ac, 3000, 0.7, h.g, t0));
    const r = env(ac, out, t0 + 0.6, 0.05, 0.8, 0.5, 0.3, 0.3 * G, 0.3);
    noise(ac, o.noise, 'brown', t0 + 0.6, r.end, lp(ac, 700, 0.7, r.g, t0));
    return Math.max(h.end, r.end);
  },
});
