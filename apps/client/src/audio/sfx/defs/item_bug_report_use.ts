// item.bug_report.use: buzzing: saw 180 Hz AM 40 Hz
import { defineSfx, env, osc, lp, lfo } from '../lib.ts';

export default defineSfx({
  id: 'item.bug_report.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.05, 0.8, 0.7, 0.1, 0.08 * G, 0.3);
    osc(ac, 'sawtooth', 180 * P, t0, e.end, lp(ac, 2400, 1, e.g, t0));
    lfo(ac, e.g.gain, 40, 0.05 * G, t0, e.end);
    return e.end;
  },
});
