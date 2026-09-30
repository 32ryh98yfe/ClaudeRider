// kart.drift_start: pink noise → bp 2 kHz Q 4, env(0.005, 0.12, 0, 0.05) + sweep 1.6 → 2.4 kHz
import { defineSfx, env, noise, bp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'kart.drift_start', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.005, 0.12, 0, 0.05, 0.32 * G);
    const f = bp(ac, 1600 * P, 4, e.g, t0);
    sweep(f.frequency, 1600 * P, 2400 * P, t0, 0.12);
    noise(ac, o.noise, 'pink', t0, e.end, f);
    return e.end;
  },
});
