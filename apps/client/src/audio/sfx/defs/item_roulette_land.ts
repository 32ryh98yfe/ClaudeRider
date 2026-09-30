// item.roulette_land: pop + short chime
import { defineSfx, env, osc, sweep, tone } from '../lib.ts';

export default defineSfx({
  id: 'item.roulette_land', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const p = env(ac, out, t0, 0.002, 0.05, 0, 0.02, 0.18 * G);
    const s = osc(ac, 'sine', 500 * P, t0, p.end, p.g);
    sweep(s.frequency, 500 * P, 1000 * P, t0, 0.05);
    const c = tone(ac, out, 'triangle', 1568 * P, t0 + 0.04, 0.2, 0.12 * G);
    return Math.max(p.end, c);
  },
});
