// kart.rail_exit: clack + whoosh
import { defineSfx, env, noise, bp, sweep, fm } from '../lib.ts';

export default defineSfx({
  id: 'kart.rail_exit', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const c = env(ac, out, t0, 0.001, 0.08, 0, 0.02, 0.16 * G);
    fm(ac, 520 * P, 1.4, 5, t0, c.end, c.g);
    const w = env(ac, out, t0, 0.03, 0.25, 0, 0.05, 0.16 * G);
    const f = bp(ac, 600, 1.2, w.g, t0);
    sweep(f.frequency, 600, 3000, t0, 0.25);
    noise(ac, o.noise, 'white', t0, w.end, f);
    return Math.max(c.end, w.end);
  },
});
