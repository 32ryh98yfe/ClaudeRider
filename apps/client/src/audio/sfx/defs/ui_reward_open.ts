// ui.reward_open: sparkle arpeggio up
import { defineSfx, arp } from '../lib.ts';

export default defineSfx({
  id: 'ui.reward_open', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return arp(ac, out, 'sine', [1047 * P, 1319 * P, 1568 * P, 2093 * P, 2637 * P], t0, 0.06, 0.25, 0.1 * G);
  },
});
