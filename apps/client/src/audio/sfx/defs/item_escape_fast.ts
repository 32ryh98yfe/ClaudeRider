// item.escape_fast: a mash-out under the fast threshold: bubble pop + bright rising three-note arpeggio
import { defineSfx, burst, arp } from '../lib.ts';

export default defineSfx({
  id: 'item.escape_fast', bus: 'sfx', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch;
    const n = burst(ac, o, out, 'white', 'bandpass', 1800, 1.4, t0, 0.07, 0.25 * G);
    const a = arp(ac, out, 'triangle', [1319 * P, 1760 * P, 2637 * P], t0 + 0.04, 0.06, 0.14, 0.13 * G);
    return Math.max(n, a);
  },
});
