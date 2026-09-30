// haz.press: hydraulic whoosh + slam
import { defineSfx, env, osc, noise, bp, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'haz.press', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const w = env(ac, out, t0, 0.15, 0.25, 0, 0.05, 0.14 * G);
    const f = bp(ac, 300, 1, w.g, t0); sweep(f.frequency, 300, 1500, t0, 0.35);
    noise(ac, o.noise, 'white', t0, w.end, f);
    const s = env(ac, out, t0 + 0.4, 0.001, 0.3, 0, 0.05, 0.45 * G);
    const so = osc(ac, 'sine', 55 * P, t0 + 0.4, s.end, s.g); sweep(so.frequency, 100 * P, 40 * P, t0 + 0.4, 0.3);
    const b = burst(ac, o, out, 'white', 'lowpass', 1500, 0.7, t0 + 0.4, 0.12, 0.3 * G);
    return Math.max(w.end, s.end, b);
  },
});
