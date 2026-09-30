// boost.gauge_full: "ding" 1760 Hz sine, env(0.002, 0.4)
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'boost.gauge_full', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'sine', 1760 * P, t0, 0.4, 0.22 * G, 0.002);
  },
});
