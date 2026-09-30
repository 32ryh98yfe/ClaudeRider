// voice.perfect: vocoded "Perfect!"
import { defineSfx } from '../lib.ts';
import { speak } from '../voice.ts';

export default defineSfx({
  id: 'voice.perfect', bus: 'voice', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return speak(ac, out, o, [[0.03, 400, 1100, 2400, 0, 0.6], [0.12, 500, 1500, 2500, 1, 0, 1.1], [0.06, 450, 1300, 1700, 0.8, 0], [0.04, 400, 1500, 2600, 0, 0.7], [0.12, 550, 1800, 2500, 1, 0, 0.95], [0.08, 400, 1500, 2500, 0, 0.6]], 220, 0.42);
  },
});
