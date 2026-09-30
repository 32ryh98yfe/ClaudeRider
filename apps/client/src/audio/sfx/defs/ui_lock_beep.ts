// ui.lock_beep: missile lock-on beep 1.2 kHz, 40 ms
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.lock_beep', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'square', 1200 * P, t0, 0.04, 0.06 * G, 0.001);
  },
});
