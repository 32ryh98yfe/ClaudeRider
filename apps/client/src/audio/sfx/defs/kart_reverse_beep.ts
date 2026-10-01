// kart.reverse_beep: reverse gear (R): a soft toy truck beep, square 1 kHz lp 2.5 kHz, 0.12 s (local only; repeated
// about every 0.9 s while the kart backs up)
import { defineSfx, env, osc, lp } from '../lib.ts';

export default defineSfx({
  id: 'kart.reverse_beep', bus: 'sfx', maxVoices: 1, spatial: false, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.005, 0.1, 0.6, 0.03, 0.06 * G, 0.06);
    osc(ac, 'square', 1000 * P, t0, e.end, lp(ac, 2500, 0.7, e.g, t0));
    return e.end;
  },
});
