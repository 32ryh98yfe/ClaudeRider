// item.throttle_drone.use: rotor spin-up
import { defineSfx, env, osc, lp, sweep, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.throttle_drone.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.1, 0.6, 0.6, 0.1, 0.12 * G, 0.2);
    const s = osc(ac, 'sawtooth', 40 * P, t0, e.end, lp(ac, 1200, 1, e.g, t0));
    sweep(s.frequency, 40 * P, 130 * P, t0, 0.6);
    lfo(ac, e.g.gain, 24, 0.04 * G, t0, e.end);
    return e.end;
  },
});
