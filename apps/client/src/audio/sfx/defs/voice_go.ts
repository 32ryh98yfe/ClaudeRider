// voice.go: vocoded "GO!" (saw carrier through formant bands, 220 Hz)
import { defineSfx } from '../lib.ts';
import { speak } from '../voice.ts';

export default defineSfx({
  id: 'voice.go', bus: 'voice', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return speak(ac, out, o, [[0.04, 300, 1200, 2400, 0.2, 0.5], [0.3, 500, 900, 2400, 1, 0, 1.05], [0.1, 450, 800, 2300, 0.6, 0, 0.9]], 220, 0.42);
  },
});
