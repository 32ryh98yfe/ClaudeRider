// ui.level_up: level-up trigger (rising arpeggio + chime)
import { defineSfx, tone, arp } from '../lib.ts';

export default defineSfx({
  id: 'ui.level_up', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = arp(ac, out, 'triangle', [523.3 * P, 659.3 * P, 784 * P, 1046.5 * P], t0, 0.08, 0.2, 0.12 * G);
    const b = tone(ac, out, 'sine', 2093 * P, t0 + 0.34, 0.5, 0.1 * G);
    return Math.max(a, b);
  },
});
