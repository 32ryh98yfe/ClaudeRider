// ui.hover: 2 ms click (sine 3 kHz)
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.hover', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'sine', 3000 * P, t0, 0.002, 0.08 * G, 0.0005);
  },
});
