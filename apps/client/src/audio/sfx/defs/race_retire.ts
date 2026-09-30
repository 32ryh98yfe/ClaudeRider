// race.retire: descending "wah" (saw lp sweep 1200 → 300 Hz)
import { defineSfx, env, osc, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'race.retire', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.7, 0, 0.1, 0.14 * G);
    const f = lp(ac, 1200, 4, e.g, t0);
    sweep(f.frequency, 1200, 300, t0, 0.7);
    osc(ac, 'sawtooth', 220 * P, t0, e.end, f);
    return e.end;
  },
});
