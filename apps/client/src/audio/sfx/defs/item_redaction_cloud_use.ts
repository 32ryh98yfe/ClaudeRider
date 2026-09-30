// item.redaction_cloud.use: low-pass whoosh (noise lp 300 Hz swell)
import { defineSfx, env, noise, lp } from '../lib.ts';

export default defineSfx({
  id: 'item.redaction_cloud.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.35, 0.6, 0, 0.1, 0.3 * G);
    noise(ac, o.noise, 'brown', t0, e.end, lp(ac, 300, 0.8, e.g, t0));
    return e.end;
  },
});
