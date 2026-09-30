// voice.nice: vocoded "Nice!" (attack landed)
import { defineSfx } from '../lib.ts';
import { speak } from '../voice.ts';

export default defineSfx({
  id: 'voice.nice', bus: 'voice', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return speak(ac, out, o, [[0.06, 250, 1700, 2600, 0.8, 0], [0.18, 700, 1200, 2500, 1, 0, 1.1], [0.1, 350, 2200, 2900, 0.9, 0, 0.95], [0.1, 400, 1800, 2700, 0, 0.9]], 220, 0.42);
  },
});
