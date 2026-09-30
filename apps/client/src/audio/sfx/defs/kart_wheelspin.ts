// kart.wheelspin: screech at slip 1 for 0.3 s + engine rev flare
import { defineSfx, env, osc, noise, bp, lp, sweep, lfo } from '../lib.ts';

export default defineSfx({
  id: 'kart.wheelspin', bus: 'sfx', maxVoices: 8, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.3, 0.5, 0.1, 0.2 * G, 0.05);
    const f = bp(ac, 2400, 3, e.g, t0);
    noise(ac, o.noise, 'white', t0, e.end, f);
    lfo(ac, e.g.gain, 8, 0.05 * G, t0, e.end);
    const r = env(ac, out, t0, 0.02, 0.35, 0, 0.05, 0.14 * G);
    const s = osc(ac, 'sawtooth', 80 * P, t0, r.end, lp(ac, 900, 1, r.g, t0));
    sweep(s.frequency, 80 * P, 230 * P, t0, 0.3);
    return Math.max(e.end, r.end);
  },
});
