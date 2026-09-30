// boost.pad: zap (square 1200 → 300 Hz, 0.08 s) + whoosh
import { defineSfx, env, osc, noise, bp, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'boost.pad', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const z = env(ac, out, t0, 0.002, 0.08, 0, 0.02, 0.12 * G);
    const s = osc(ac, 'square', 1200 * P, t0, z.end, lp(ac, 3000, 0.7, z.g, t0));
    sweep(s.frequency, 1200 * P, 300 * P, t0, 0.08);
    const w = env(ac, out, t0 + 0.02, 0.03, 0.25, 0, 0.05, 0.16 * G);
    const f = bp(ac, 400, 1, w.g, t0);
    sweep(f.frequency, 400, 3000, t0, 0.25);
    noise(ac, o.noise, 'white', t0, w.end, f);
    return Math.max(z.end, w.end);
  },
});
