// kart.land_hard: sine 70 Hz 0.18 s + suspension spring (triangle 300 Hz vibrato 12 Hz, 0.2 s)
import { defineSfx, env, osc, sweep, lfo } from '../lib.ts';

export default defineSfx({
  id: 'kart.land_hard', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.001, 0.18, 0, 0.03, 0.45 * G);
    const s = osc(ac, 'sine', 70 * P, t0, e.end, e.g);
    sweep(s.frequency, 95 * P, 55 * P, t0, 0.18);
    const sp = env(ac, out, t0 + 0.02, 0.005, 0.2, 0, 0.03, 0.08 * G);
    const tri = osc(ac, 'triangle', 300 * P, t0, sp.end, sp.g);
    lfo(ac, tri.frequency, 12, 40, t0, sp.end);
    return Math.max(e.end, sp.end);
  },
});
