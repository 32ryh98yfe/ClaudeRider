// kart.tap_boost: a valid tap (톡톡이): exhaust "pff" (noise bp 900 → 2.4 kHz, 0.09 s) + rising chirp square
// 660 → 990 Hz. The caller raises `pitch` with the streak (×1, ×1.12, ×1.24) and `k` = streak / 3 adds a top sparkle.
import { defineSfx, env, noise, bp, lp, osc, sweep, tone } from '../lib.ts';

export default defineSfx({
  id: 'kart.tap_boost', bus: 'sfx', maxVoices: 4, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.003, 0.09, 0, 0.03, 0.2 * G);
    const f = bp(ac, 900 * P, 1.5, e.g, t0);
    sweep(f.frequency, 900 * P, 2400 * P, t0, 0.09);
    noise(ac, o.noise, 'white', t0, e.end, f);
    const c = env(ac, out, t0, 0.003, 0.08, 0, 0.02, 0.07 * G);
    const s = osc(ac, 'square', 660 * P, t0, c.end, lp(ac, 3000, 0.8, c.g, t0));
    sweep(s.frequency, 660 * P, 990 * P, t0, 0.07);
    const top = k > 0.9 ? tone(ac, out, 'sine', 2637 * P, t0 + 0.05, 0.12, 0.05 * G, 0.002) : t0;
    return Math.max(e.end, c.end, top);
  },
});
