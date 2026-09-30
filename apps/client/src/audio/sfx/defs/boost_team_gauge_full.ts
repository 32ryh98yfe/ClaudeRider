// boost.team_gauge_full: two-tone ding 1320 + 1760 Hz
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'boost.team_gauge_full', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = tone(ac, out, 'sine', 1320 * P, t0, 0.3, 0.16 * G, 0.002);
    const b = tone(ac, out, 'sine', 1760 * P, t0 + 0.12, 0.35, 0.16 * G, 0.002);
    return Math.max(a, b);
  },
});
