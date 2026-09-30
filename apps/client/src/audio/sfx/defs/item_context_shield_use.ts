// item.context_shield.use: bell-like FM chime fm(880, 3.5, 4)
import { defineSfx, env, fm } from '../lib.ts';

export default defineSfx({
  id: 'item.context_shield.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.9, 0, 0.1, 0.14 * G);
    const f = fm(ac, 880 * P, 3.5, 4, t0, e.end, e.g);
    f.depth.gain.setValueAtTime(4 * 880 * 3.5 * P, t0); f.depth.gain.exponentialRampToValueAtTime(60, t0 + 0.8);
    return e.end;
  },
});
