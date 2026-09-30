// item.interpretability_lens.use: soft scan blip (sine 1500 Hz sweeping 0.5 s)
import { defineSfx, env, osc, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.interpretability_lens.use', bus: 'ui', maxVoices: 1, spatial: false,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.5, 0, 0.05, 0.12 * G);
    const s = osc(ac, 'sine', 1500 * P, t0, e.end, e.g);
    lfo(ac, s.frequency, 4, 300, t0, e.end);
    return e.end;
  },
});
