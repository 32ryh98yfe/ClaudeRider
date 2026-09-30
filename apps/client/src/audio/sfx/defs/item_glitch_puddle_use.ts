// item.glitch_puddle.use: plop
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'item.glitch_puddle.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.12, 0, 0.02, 0.25 * G);
    const s = osc(ac, 'sine', 400 * P, t0, e.end, e.g);
    sweep(s.frequency, 420 * P, 140 * P, t0, 0.1);
    return e.end;
  },
});
