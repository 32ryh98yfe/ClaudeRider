// item.overclock_aura.hit: zap + spin whirl
import { defineSfx, env, osc, bp, lp, sweep, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.overclock_aura.hit', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const z = env(ac, out, t0, 0.002, 0.08, 0, 0.02, 0.12 * G);
    const s = osc(ac, 'sawtooth', 1500 * P, t0, z.end, bp(ac, 2000, 2, z.g, t0));
    sweep(s.frequency, 1500 * P, 400 * P, t0, 0.08);
    const w = env(ac, out, t0 + 0.05, 0.02, 0.5, 0, 0.05, 0.1 * G);
    const v = osc(ac, 'sawtooth', 700 * P, t0, w.end, lp(ac, 1600, 1, w.g, t0));
    sweep(v.frequency, 700 * P, 220 * P, t0 + 0.05, 0.5); lfo(ac, v.frequency, 11, 60, t0, w.end);
    return Math.max(z.end, w.end);
  },
});
