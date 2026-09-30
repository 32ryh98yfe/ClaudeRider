// item.roulette_tick: click (square 2 kHz, 4 ms)
import { defineSfx, env, osc } from '../lib.ts';

export default defineSfx({
  id: 'item.roulette_tick', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.0005, 0.004, 0, 0.003, 0.12 * G);
    osc(ac, 'square', 2000 * P, t0, e.end, e.g);
    return e.end;
  },
});
