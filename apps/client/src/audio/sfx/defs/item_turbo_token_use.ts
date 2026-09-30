// item.turbo_token.use: rising saw 200 → 800 Hz + noise whoosh
import { defineSfx, env, osc, noise, bp, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'item.turbo_token.use', bus: 'sfx', maxVoices: 4, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.4, 0, 0.05, 0.12 * G);
    const s = osc(ac, 'sawtooth', 200 * P, t0, e.end, lp(ac, 2500, 1, e.g, t0));
    sweep(s.frequency, 200 * P, 800 * P, t0, 0.4);
    const w = env(ac, out, t0, 0.05, 0.35, 0, 0.05, 0.14 * G);
    const f = bp(ac, 500, 1, w.g, t0);
    sweep(f.frequency, 500, 3500, t0, 0.35);
    noise(ac, o.noise, 'white', t0, w.end, f);
    return Math.max(e.end, w.end);
  },
});
