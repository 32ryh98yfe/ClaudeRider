// voice.final_lap: vocoded "Final lap!"
import { defineSfx } from '../lib.ts';
import { speak } from '../voice.ts';

export default defineSfx({
  id: 'voice.final_lap', bus: 'voice', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return speak(ac, out, o, [
      [0.07, 400, 1600, 2600, 0, 0.8], [0.14, 700, 1200, 2500, 1, 0], [0.1, 400, 2200, 2900, 1, 0, 1.08], [0.06, 250, 1700, 2600, 0.7, 0], [0.08, 450, 1500, 2500, 0.9, 0],
      [0.04, 300, 1100, 2400, 0.7, 0], [0.06, 350, 1100, 2400, 0.9, 0], [0.16, 700, 1700, 2500, 1, 0, 1.1], [0.05, 400, 1000, 2300, 0, 0.6],
    ], 220, 0.42);
  },
});
