// kart.wall_hit_soft: low-pass noise burst 0.12 s + sine 90 Hz thump env(0.001, 0.15)
import { defineSfx, env, osc, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'kart.wall_hit_soft', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const n = burst(ac, o, out, 'white', 'lowpass', 1400, 0.8, t0, 0.12, 0.3 * G);
    const e = env(ac, out, t0, 0.001, 0.15, 0, 0.02, 0.45 * G);
    const s = osc(ac, 'sine', 90 * P, t0, e.end, e.g);
    sweep(s.frequency, 110 * P, 70 * P, t0, 0.15);
    return Math.max(n, e.end);
  },
});
