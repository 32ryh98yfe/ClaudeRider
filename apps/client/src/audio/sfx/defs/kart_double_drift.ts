// kart.double_drift: drift start + airy whoosh (noise hp 3 kHz, 0.2 s)
import { defineSfx, env, noise, bp, hp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'kart.double_drift', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.005, 0.12, 0, 0.05, 0.3 * G);
    const f = bp(ac, 1600 * P, 4, e.g, t0);
    sweep(f.frequency, 1700 * P, 2600 * P, t0, 0.12);
    noise(ac, o.noise, 'pink', t0, e.end, f);
    const w = env(ac, out, t0 + 0.03, 0.05, 0.2, 0, 0.05, 0.18 * G);
    noise(ac, o.noise, 'white', t0, w.end, hp(ac, 3000, 0.7, w.g, t0));
    return Math.max(e.end, w.end);
  },
});
