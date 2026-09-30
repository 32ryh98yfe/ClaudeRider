// item.context_shield.hit: glass pop (noise hp 5 kHz 0.05 s + 2.6 kHz ping)
import { defineSfx, tone, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.context_shield.hit', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const n = burst(ac, o, out, 'white', 'highpass', 5000, 0.7, t0, 0.05, 0.22 * G);
    const p = tone(ac, out, 'sine', 2600 * P, t0, 0.18, 0.14 * G, 0.001);
    return Math.max(n, p);
  },
});
