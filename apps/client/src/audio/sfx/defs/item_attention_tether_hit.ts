// item.attention_tether.hit: clunk (sine 150 Hz + noise tick) on attach
import { defineSfx, env, osc, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.attention_tether.hit', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.12, 0, 0.02, 0.3 * G);
    osc(ac, 'sine', 150 * P, t0, e.end, e.g);
    const n = burst(ac, o, out, 'white', 'bandpass', 1800, 1, t0, 0.02, 0.14 * G);
    return Math.max(e.end, n);
  },
});
