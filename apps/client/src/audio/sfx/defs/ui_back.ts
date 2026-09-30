// ui.back: two-note down 660 → 495 Hz
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.back', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'triangle', 660 * P, t0, 0.06, 0.14 * G);
    const b = tone(ac, out, 'triangle', 495 * P, t0 + 0.06, 0.1, 0.14 * G);
    return Math.max(a, b);
  },
});
