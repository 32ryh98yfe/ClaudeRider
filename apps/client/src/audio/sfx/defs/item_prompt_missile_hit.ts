// item.prompt_missile.hit: explosion: noise lp 1 kHz 0.5 s + 50 Hz sub
import { defineSfx, env, osc, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.prompt_missile.hit', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const n = burst(ac, o, out, 'brown', 'lowpass', 1000, 0.7, t0, 0.5, 0.42 * G);
    const e = env(ac, out, t0, 0.002, 0.45, 0, 0.05, 0.4 * G);
    const s = osc(ac, 'sine', 50 * P, t0, e.end, e.g);
    sweep(s.frequency, 80 * P, 40 * P, t0, 0.45);
    return Math.max(n, e.end);
  },
});
