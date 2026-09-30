// item.spin: spin-out whirl (saw vibrato sweep 800 → 200 Hz)
import { defineSfx, env, osc, lp, sweep, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.spin', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.6, 0, 0.05, 0.1 * G);
    const s = osc(ac, 'sawtooth', 800 * P, t0, e.end, lp(ac, 2500, 1, e.g, t0));
    sweep(s.frequency, 800 * P, 200 * P, t0, 0.6);
    lfo(ac, s.frequency, 9, 80, t0, e.end);
    return e.end;
  },
});
