// ui.ready: chime 880 Hz
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.ready', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'sine', 880 * P, t0, 0.35, 0.16 * G, 0.002);
  },
});
