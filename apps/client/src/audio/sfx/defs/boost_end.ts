// boost.end: soft exhale: noise lp 800 Hz fade 0.3 s
import { defineSfx, env, noise, lp } from '../lib.ts';

export default defineSfx({
  id: 'boost.end', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.3, 0, 0.05, 0.14 * G);
    noise(ac, o.noise, 'pink', t0, e.end, lp(ac, 800, 0.7, e.g, t0));
    return e.end;
  },
});
