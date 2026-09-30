// boost.team_ignite: ignite + major-third chorus shimmer (sine 880/1109 Hz, 0.4 s)
import { defineSfx, env, osc, noise, bp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'boost.team_ignite', bus: 'sfx', maxVoices: 4, spatial: true, priority: 2,
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
    const c = env(ac, out, t0 + 0.05, 0.03, 0.4, 0, 0.1, 0.1 * G);
    osc(ac, 'sine', 880 * P, t0, c.end, c.g, 6); osc(ac, 'sine', 1109 * P, t0, c.end, c.g, -6);
    return Math.max(e.end, th.end, c.end);
  },
});
