// item.firewall.hit: brick smash (noise bp 800 Hz bursts)
import { defineSfx, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.firewall.hit', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = t0;
    for (let i = 0; i < 5; i++) end = Math.max(end, burst(ac, o, out, 'white', 'bandpass', 800, 1.4, t0 + i * 0.03, 0.08, 0.2 * G));
    return end;
  },
});
