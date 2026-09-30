// kart.bump: sine 120 → 80 Hz 0.1 s + rubber squeak (square 900 Hz, vibrato 30 Hz, 0.06 s); gain by impulse
import { defineSfx, env, osc, lp, sweep, lfo } from '../lib.ts';

export default defineSfx({
  id: 'kart.bump', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const g = G * (0.35 + 0.65 * k);
    const e = env(ac, out, t0, 0.002, 0.1, 0, 0.02, 0.4 * g);
    const s = osc(ac, 'sine', 120 * P, t0, e.end, e.g);
    sweep(s.frequency, 120 * P, 80 * P, t0, 0.1);
    const q = env(ac, out, t0 + 0.01, 0.003, 0.06, 0, 0.02, 0.07 * g);
    const sq = osc(ac, 'square', 900 * P, t0, q.end, lp(ac, 2500, 0.7, q.g, t0));
    lfo(ac, sq.frequency, 30, 60, t0, q.end);
    return Math.max(e.end, q.end);
  },
});
