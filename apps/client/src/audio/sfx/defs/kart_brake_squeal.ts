// kart.brake_squeal: square 2.2 kHz bp Q 8, vibrato 5 Hz, gain by speed
import { defineSfx, env, osc, bp, lfo } from '../lib.ts';

export default defineSfx({
  id: 'kart.brake_squeal', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.03, 0.3, 0.6, 0.12, 0.1 * G * (0.3 + 0.7 * k), 0.1);
    const sq = osc(ac, 'square', 2200 * P, t0, e.end, bp(ac, 2200 * P, 8, e.g, t0));
    lfo(ac, sq.frequency, 5, 35, t0, e.end);
    return e.end;
  },
});
