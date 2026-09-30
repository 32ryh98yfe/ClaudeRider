// kart.land_soft: sine 100 Hz 0.08 s + noise tick
import { defineSfx, env, osc, burst } from '../lib.ts';

export default defineSfx({
  id: 'kart.land_soft', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.001, 0.08, 0, 0.02, 0.4 * G);
    osc(ac, 'sine', 100 * P, t0, e.end, e.g);
    const n = burst(ac, o, out, 'white', 'highpass', 2500, 0.7, t0, 0.02, 0.12 * G);
    return Math.max(e.end, n);
  },
});
