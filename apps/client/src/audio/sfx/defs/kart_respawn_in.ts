// kart.respawn_in: ascending arpeggio 660/990/1320 + soft pop
import { defineSfx, env, osc, sweep, arp } from '../lib.ts';

export default defineSfx({
  id: 'kart.respawn_in', bus: 'sfx', maxVoices: 2, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = arp(ac, out, 'sine', [660 * P, 990 * P, 1320 * P], t0, 0.1, 0.2, 0.16 * G);
    const p = env(ac, out, t0 + 0.32, 0.002, 0.06, 0, 0.02, 0.2 * G);
    const s = osc(ac, 'sine', 500 * P, t0 + 0.32, p.end, p.g);
    sweep(s.frequency, 400 * P, 900 * P, t0 + 0.32, 0.05);
    return Math.max(a, p.end);
  },
});
