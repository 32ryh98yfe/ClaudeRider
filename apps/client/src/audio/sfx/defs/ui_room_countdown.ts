// ui.room_countdown: soft tick per second of the room auto-start
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.room_countdown', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'triangle', 1100 * P, t0, 0.03, 0.08 * G, 0.001);
  },
});
