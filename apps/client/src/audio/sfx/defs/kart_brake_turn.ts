// kart.brake_turn: brake drift turn (고속턴): sharp squeal square 2.6 kHz bp Q 8 with 7 Hz vibrato, 0.18 s, plus a
// scrub of pink noise lp 1.4 kHz
import { defineSfx, env, noise, bp, lp, osc, lfo } from '../lib.ts';

export default defineSfx({
  id: 'kart.brake_turn', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.18, 0, 0.06, 0.11 * G);
    const sq = osc(ac, 'square', 2600 * P, t0, e.end, bp(ac, 2600 * P, 8, e.g, t0));
    lfo(ac, sq.frequency, 7, 60, t0, e.end);
    const s = env(ac, out, t0, 0.005, 0.2, 0, 0.05, 0.12 * G);
    noise(ac, o.noise, 'pink', t0, s.end, lp(ac, 1400, 0.8, s.g, t0));
    return Math.max(e.end, s.end);
  },
});
