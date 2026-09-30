// ui.confirm: two-note up 660 → 990 Hz
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.confirm', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'triangle', 660 * P, t0, 0.06, 0.16 * G);
    const b = tone(ac, out, 'triangle', 990 * P, t0 + 0.06, 0.1, 0.16 * G);
    return Math.max(a, b);
  },
});
