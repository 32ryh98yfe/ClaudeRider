// boost.ignite: noise sweep bp 200 → 4 kHz over 0.3 s + 60 Hz sine thump
import { defineSfx, env, osc, noise, bp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'boost.ignite', bus: 'sfx', maxVoices: 4, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.32, 0, 0.05, 0.3 * G);
    const f = bp(ac, 200, 1.4, e.g, t0);
    sweep(f.frequency, 200, 4000, t0, 0.3);
    noise(ac, o.noise, 'white', t0, e.end, f);
    const th = env(ac, out, t0, 0.002, 0.25, 0, 0.03, 0.42 * G);
    const s = osc(ac, 'sine', 60 * P, t0, th.end, th.g);
    sweep(s.frequency, 90 * P, 45 * P, t0, 0.25);
    return Math.max(e.end, th.end);
  },
});
