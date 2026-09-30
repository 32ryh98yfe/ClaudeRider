// item.token_bomb.use: falling whistle sine 2000 → 600 Hz over the 36-tick lob
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'item.token_bomb.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.6, 0.6, 0.05, 0.1 * G, 0.1);
    const s = osc(ac, 'sine', 2000 * P, t0, e.end, e.g);
    sweep(s.frequency, 2000 * P, 600 * P, t0, 0.6);
    return e.end;
  },
});
