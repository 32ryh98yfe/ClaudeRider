// item.redaction_cloud.hit: muffled "thump" (the mixer low-passes the music for 1.5 s)
import { defineSfx, env, osc, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'item.redaction_cloud.hit', bus: 'ui', maxVoices: 1, spatial: false, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.002, 0.25, 0, 0.04, 0.35 * G);
    const s = osc(ac, 'sine', 70 * P, t0, e.end, lp(ac, 300, 0.7, e.g, t0));
    sweep(s.frequency, 90 * P, 50 * P, t0, 0.25);
    return e.end;
  },
});
