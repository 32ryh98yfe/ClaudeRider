// item.alignment_halo.use: choir-like pad (3 detuned saws, formant bp 700/1200 Hz) 1 s
import { defineSfx, env, osc, bp } from '../lib.ts';

export default defineSfx({
  id: 'item.alignment_halo.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.2, 1.0, 0, 0.3, 0.1 * G);
    const f1 = bp(ac, 700, 5, e.g, t0), f2 = bp(ac, 1200, 6, e.g, t0);
    for (const [n, d] of [[440, -8], [554.4, 5], [659.3, 9]] as const) { osc(ac, 'sawtooth', n * P, t0, e.end, f1, d); osc(ac, 'sawtooth', n * P, t0, e.end, f2, -d); }
    return e.end;
  },
});
