// haz.traffic_horn: car horn (square 420 Hz)
import { defineSfx, env, osc, lp } from '../lib.ts';

export default defineSfx({
  id: 'haz.traffic_horn', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.35, 0.8, 0.05, 0.08 * G, 0.15);
    osc(ac, 'square', 420 * P, t0, e.end, lp(ac, 2000, 0.8, e.g, t0));
    return e.end;
  },
});
