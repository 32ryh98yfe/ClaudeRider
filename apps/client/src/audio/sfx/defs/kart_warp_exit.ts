// kart.warp_exit: sweep 2000 → 400 Hz + sparkle chimes
import { defineSfx, env, sweep, fm, arp } from '../lib.ts';

export default defineSfx({
  id: 'kart.warp_exit', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.4, 0, 0.05, 0.14 * G);
    const f = fm(ac, 2000 * P, 1.5, 2, t0, e.end, e.g);
    sweep(f.car.frequency, 2000 * P, 400 * P, t0, 0.4);
    const c = arp(ac, out, 'sine', [1760 * P, 2093 * P, 2637 * P], t0 + 0.15, 0.06, 0.25, 0.09 * G);
    return Math.max(e.end, c);
  },
});
