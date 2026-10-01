// kart.spin_out: brake held too long in a drift: a 0.55 s tyre screech falling bp 2.2 → 900 Hz with 9 Hz AM, a
// toy "wobble" saw 520 → 180 Hz, and a low thud at the end (sine 80 Hz)
import { defineSfx, env, noise, bp, lp, osc, sweep, lfo } from '../lib.ts';

export default defineSfx({
  id: 'kart.spin_out', bus: 'sfx', maxVoices: 4, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.55, 0, 0.08, 0.18 * G);
    const f = bp(ac, 2200 * P, 3, e.g, t0);
    sweep(f.frequency, 2200 * P, 900 * P, t0, 0.55);
    noise(ac, o.noise, 'white', t0, e.end, f);
    lfo(ac, e.g.gain, 9, 0.05 * G, t0, e.end);
    const w = env(ac, out, t0, 0.01, 0.5, 0, 0.05, 0.07 * G);
    const s = osc(ac, 'sawtooth', 520 * P, t0, w.end, lp(ac, 2000, 1, w.g, t0));
    sweep(s.frequency, 520 * P, 180 * P, t0, 0.5);
    lfo(ac, s.frequency, 11, 40, t0, w.end);
    const th = env(ac, out, t0 + 0.42, 0.002, 0.16, 0, 0.03, 0.16 * G);
    osc(ac, 'sine', 80 * P, t0 + 0.42, th.end, th.g);
    return Math.max(e.end, w.end, th.end);
  },
});
