// voice.finish: vocoded "Finish!"
import { defineSfx } from '../lib.ts';
import { speak } from '../voice.ts';

export default defineSfx({
  id: 'voice.finish', bus: 'voice', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return speak(ac, out, o, [[0.07, 400, 1600, 2600, 0, 0.8], [0.12, 350, 2100, 2900, 1, 0, 1.08], [0.06, 250, 1700, 2600, 0.7, 0], [0.12, 350, 2100, 2900, 1, 0], [0.14, 400, 1800, 2700, 0, 0.9]], 220, 0.42);
  },
});
