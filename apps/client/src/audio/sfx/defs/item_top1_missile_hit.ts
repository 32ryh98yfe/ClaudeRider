// item.top1_missile.hit: gold burst: bigger explosion + chime
import { defineSfx, env, osc, sweep, burst, arp } from '../lib.ts';

export default defineSfx({
  id: 'item.top1_missile.hit', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const n = burst(ac, o, out, 'brown', 'lowpass', 1300, 0.7, t0, 0.6, 0.42 * G);
    const e = env(ac, out, t0, 0.002, 0.5, 0, 0.05, 0.4 * G);
    const s = osc(ac, 'sine', 45 * P, t0, e.end, e.g);
    sweep(s.frequency, 80 * P, 35 * P, t0, 0.5);
    const c = arp(ac, out, 'triangle', [1046.5 * P, 1318.5 * P, 1568 * P], t0 + 0.1, 0.06, 0.3, 0.06 * G);
    return Math.max(n, e.end, c);
  },
});
