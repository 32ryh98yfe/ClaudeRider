// item.mirror_mode.use: descending arpeggio (sine 1320/1047/880/659)
import { defineSfx, arp } from '../lib.ts';

export default defineSfx({
  id: 'item.mirror_mode.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return arp(ac, out, 'sine', [1320 * P, 1047 * P, 880 * P, 659 * P], t0, 0.08, 0.16, 0.14 * G);
  },
});
