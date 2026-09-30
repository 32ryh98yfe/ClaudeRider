// boost.instant: bright two-note chime 1568 → 2093 Hz, 60 ms each
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'boost.instant', bus: 'sfx', maxVoices: 2, spatial: false, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'sine', 1568 * P, t0, 0.06, 0.2 * G, 0.002);
    const b = tone(ac, out, 'sine', 2093 * P, t0 + 0.06, 0.12, 0.2 * G, 0.002);
    return Math.max(a, b);
  },
});
