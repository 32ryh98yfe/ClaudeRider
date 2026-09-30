// item.attention_tether.use: FM warble fm(440, 1.01, 8), vibrato 7 Hz, 0.6 s
import { defineSfx, env, fm, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.attention_tether.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.6, 0.5, 0.1, 0.12 * G, 0.2);
    const f = fm(ac, 440 * P, 1.01, 8, t0, e.end, e.g);
    lfo(ac, f.car.frequency, 7, 25, t0, e.end);
    return e.end;
  },
});
