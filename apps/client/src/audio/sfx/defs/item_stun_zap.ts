// item.stun_zap: electric buzz (square 60 Hz + noise crackle) 0.9 s
import { defineSfx, env, osc, lp, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.stun_zap', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.005, 0.9, 0.5, 0.1, 0.1 * G, 0.3);
    osc(ac, 'square', 60 * P, t0, e.end, lp(ac, 1600, 1, e.g, t0));
    let end = e.end;
    for (let i = 0; i < 10; i++) end = Math.max(end, burst(ac, o, out, 'white', 'highpass', 3500, 0.7, t0 + Math.random() * 0.85, 0.006, 0.12 * G));
    return end;
  },
});
