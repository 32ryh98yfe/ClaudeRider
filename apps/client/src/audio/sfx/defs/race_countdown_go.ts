// race.countdown_go: 880 Hz + A-major triad stab, 300 ms
import { defineSfx, env, osc, lp, tone } from '../lib.ts';

export default defineSfx({
  id: 'race.countdown_go', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = tone(ac, out, 'sine', 880 * P, t0, 0.3, 0.2 * G, 0.003);
    for (const n of [440, 554.4, 659.3]) {
      const e = env(ac, out, t0, 0.005, 0.3, 0, 0.05, 0.08 * G);
      osc(ac, 'sawtooth', n * P, t0, e.end, lp(ac, 2400, 0.8, e.g, t0));
      end = Math.max(end, e.end);
    }
    return end;
  },
});
