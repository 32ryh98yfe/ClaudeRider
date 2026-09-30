// item.mutex_lock.use: heavy clunk (sine 70 Hz + metal fm)
import { defineSfx, env, osc, fm } from '../lib.ts';

export default defineSfx({
  id: 'item.mutex_lock.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.3, 0, 0.05, 0.4 * G);
    osc(ac, 'sine', 70 * P, t0, e.end, e.g);
    const m = env(ac, out, t0, 0.001, 0.15, 0, 0.03, 0.08 * G);
    fm(ac, 330 * P, 2.9, 6, t0, m.end, m.g);
    return Math.max(e.end, m.end);
  },
});
