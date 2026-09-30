// item.broadcast_bolt.use: noise crack (0.05 s, hp 2 kHz) + sub boom 40 Hz 0.6 s
import { defineSfx, env, osc, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.broadcast_bolt.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const c = burst(ac, o, out, 'white', 'highpass', 2000, 0.7, t0, 0.05, 0.3 * G);
    const e = env(ac, out, t0, 0.003, 0.6, 0, 0.1, 0.42 * G);
    const s = osc(ac, 'sine', 40 * P, t0, e.end, e.g);
    sweep(s.frequency, 70 * P, 32 * P, t0, 0.6);
    return Math.max(c, e.end);
  },
});
