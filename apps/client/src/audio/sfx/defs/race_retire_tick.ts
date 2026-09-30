// race.retire_tick: woodblock tick (sine 1200 Hz 20 ms); last 3 s higher 1600 Hz
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'race.retire_tick', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return tone(ac, out, 'sine', (k >= 0.5 ? 1600 : 1200) * P, t0, 0.02, 0.2 * G, 0.001);
  },
});
