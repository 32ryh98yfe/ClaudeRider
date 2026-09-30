// jingle.level_up: 4 bars: rising arpeggio + chime
import { defineSfx, tone, arp } from '../lib.ts';

export default defineSfx({
  id: 'jingle.level_up', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = arp(ac, out, 'triangle', [523.3, 659.3, 784, 1046.5, 1318.5, 1568].map((x) => x * P), t0, 0.09, 0.3, 0.12 * G);
    const b = tone(ac, out, 'sine', 2093 * P, t0 + 0.6, 0.9, 0.1 * G);
    return Math.max(a, b);
  },
});
