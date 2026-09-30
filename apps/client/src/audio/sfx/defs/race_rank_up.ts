// race.rank_up: blip 660 → 990 Hz
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'race.rank_up', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.003, 0.12, 0, 0.02, 0.16 * G);
    const s = osc(ac, 'sine', 660 * P, t0, e.end, e.g);
    sweep(s.frequency, 660 * P, 990 * P, t0, 0.1);
    return e.end;
  },
});
