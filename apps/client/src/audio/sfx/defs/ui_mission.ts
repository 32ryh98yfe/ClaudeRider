// ui.mission: 3-note motif
import { defineSfx, arp } from '../lib.ts';

export default defineSfx({
  id: 'ui.mission', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return arp(ac, out, 'triangle', [784 * P, 988 * P, 1175 * P], t0, 0.09, 0.2, 0.12 * G);
  },
});
