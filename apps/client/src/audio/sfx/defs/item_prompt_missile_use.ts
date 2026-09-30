// item.prompt_missile.use: launch: noise burst + saw sweep 300 → 1200 Hz
import { defineSfx, env, osc, lp, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.prompt_missile.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const n = burst(ac, o, out, 'white', 'lowpass', 2500, 0.7, t0, 0.15, 0.2 * G);
    const e = env(ac, out, t0, 0.01, 0.35, 0, 0.05, 0.1 * G);
    const s = osc(ac, 'sawtooth', 300 * P, t0, e.end, lp(ac, 3000, 1, e.g, t0));
    sweep(s.frequency, 300 * P, 1200 * P, t0, 0.35);
    return Math.max(n, e.end);
  },
});
