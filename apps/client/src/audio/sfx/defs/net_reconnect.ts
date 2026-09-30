// net.reconnect: two-tone "connected"
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'net.reconnect', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'sine', 784 * P, t0, 0.1, 0.14 * G);
    const b = tone(ac, out, 'sine', 1175 * P, t0 + 0.12, 0.16, 0.14 * G);
    return Math.max(a, b);
  },
});
