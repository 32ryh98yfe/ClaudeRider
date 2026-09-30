// item.escape_pop: bubble burst + instant-boost chime
import { defineSfx, tone, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.escape_pop', bus: 'sfx', maxVoices: 2, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const n = burst(ac, o, out, 'white', 'bandpass', 1500, 1.5, t0, 0.06, 0.25 * G);
    const a = tone(ac, out, 'sine', 1568 * P, t0 + 0.04, 0.06, 0.14 * G, 0.002);
    const b = tone(ac, out, 'sine', 2093 * P, t0 + 0.1, 0.12, 0.14 * G, 0.002);
    return Math.max(n, a, b);
  },
});
