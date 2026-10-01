// kart.cut: cutting a drift: a short tyre chirp (noise bp 2.4 kHz Q 5, 0.07 s) + a chassis settle thump (sine 110 → 70 Hz)
import { defineSfx, env, noise, bp, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'kart.cut', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.07, 0, 0.03, 0.2 * G);
    noise(ac, o.noise, 'white', t0, e.end, bp(ac, 2400 * P, 5, e.g, t0));
    const th = env(ac, out, t0, 0.002, 0.1, 0, 0.02, 0.16 * G);
    const s = osc(ac, 'sine', 110 * P, t0, th.end, th.g);
    sweep(s.frequency, 110 * P, 70 * P, t0, 0.1);
    return Math.max(e.end, th.end);
  },
});
