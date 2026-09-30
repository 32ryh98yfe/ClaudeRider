// item.throttle_drone.loop: 90 Hz saw with 6 Hz wobble while stacked (1.5 s segment, re-triggered)
import { defineSfx, env, osc, lp, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.throttle_drone.loop', bus: 'sfx', maxVoices: 2, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.1, 1.0, 0.8, 0.2, 0.08 * G, 0.4);
    const s = osc(ac, 'sawtooth', 90 * P, t0, e.end, lp(ac, 700, 1, e.g, t0));
    lfo(ac, s.frequency, 6, 8, t0, e.end);
    return e.end;
  },
});
