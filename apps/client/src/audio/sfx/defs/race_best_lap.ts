// race.best_lap: lap chime + sparkle arpeggio
import { defineSfx, tone, arp } from '../lib.ts';

export default defineSfx({
  id: 'race.best_lap', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'triangle', 988 * P, t0, 0.12, 0.16 * G);
    const b = tone(ac, out, 'triangle', 1319 * P, t0 + 0.11, 0.22, 0.16 * G);
    const c = arp(ac, out, 'sine', [1568 * P, 1976 * P, 2349 * P, 2637 * P], t0 + 0.25, 0.05, 0.18, 0.08 * G);
    return Math.max(a, b, c);
  },
});
