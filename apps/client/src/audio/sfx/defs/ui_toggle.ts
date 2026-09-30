// ui.toggle: tick 1.5 kHz
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.toggle', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'sine', 1500 * P, t0, 0.012, 0.12 * G, 0.001);
  },
});
