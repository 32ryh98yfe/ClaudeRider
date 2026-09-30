// race.countdown_beep: 440 Hz sine + triangle, 120 ms
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'race.countdown_beep', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'sine', 440 * P, t0, 0.12, 0.2 * G, 0.003);
    const b = tone(ac, out, 'triangle', 440 * P, t0, 0.12, 0.12 * G, 0.003);
    return Math.max(a, b);
  },
});
