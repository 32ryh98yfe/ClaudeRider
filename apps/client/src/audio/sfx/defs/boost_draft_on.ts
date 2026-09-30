// boost.draft_on: whoosh ring (noise bp sweep 400 → 4000 Hz, 0.3 s)
import { defineSfx, env, noise, bp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'boost.draft_on', bus: 'sfx', maxVoices: 1, spatial: false,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.05, 0.25, 0, 0.05, 0.18 * G);
    const f = bp(ac, 400, 2, e.g, t0);
    sweep(f.frequency, 400, 4000, t0, 0.3);
    noise(ac, o.noise, 'white', t0, e.end, f);
    return e.end;
  },
});
