// race.lap: two-note chime 988 → 1319 Hz
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'race.lap', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'triangle', 988 * P, t0, 0.12, 0.18 * G);
    const b = tone(ac, out, 'triangle', 1319 * P, t0 + 0.11, 0.22, 0.18 * G);
    return Math.max(a, b);
  },
});
