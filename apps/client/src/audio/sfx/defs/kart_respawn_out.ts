// kart.respawn_out: descending glass arpeggio (sine 1320/990/660) 0.4 s
import { defineSfx, arp } from '../lib.ts';

export default defineSfx({
  id: 'kart.respawn_out', bus: 'sfx', maxVoices: 2, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    return arp(ac, out, 'sine', [1320 * P, 990 * P, 660 * P], t0, 0.12, 0.2, 0.16 * G);
  },
});
