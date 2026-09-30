// item.throttle_drone.hit: the drone latches on: servo clunk, falling rotor whine, then a low throttling buzz
import { defineSfx, env, osc, lp, sweep, lfo, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.throttle_drone.hit', bus: 'sfx', maxVoices: 3, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch;
    const clunk = burst(ac, o, out, 'brown', 'lowpass', 700, 0.8, t0, 0.08, 0.3 * G);
    const e = env(ac, out, t0 + 0.02, 0.01, 0.5, 0.35, 0.2, 0.14 * G, 0.15);
    const s = osc(ac, 'sawtooth', 150 * P, t0 + 0.02, e.end, lp(ac, 900, 2, e.g, t0));
    sweep(s.frequency, 150 * P, 55 * P, t0 + 0.02, 0.5);
    lfo(ac, e.g.gain, 18, 0.05 * G, t0 + 0.1, e.end, 'square');
    return Math.max(clunk, e.end);
  },
});
