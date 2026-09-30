// ui.slider_tick: tick 2 kHz, 3 ms
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.slider_tick', bus: 'ui', maxVoices: 3, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'sine', 2000 * P, t0, 0.003, 0.08 * G, 0.0005);
  },
});
