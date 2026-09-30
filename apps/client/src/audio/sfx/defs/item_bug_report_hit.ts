// item.bug_report.hit: bubble-wrap pop
import { defineSfx, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.bug_report.hit', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = t0;
    for (let i = 0; i < 4; i++) end = Math.max(end, burst(ac, o, out, 'white', 'bandpass', 1200 + i * 300, 3, t0 + i * 0.04, 0.02, 0.18 * G));
    return end;
  },
});
