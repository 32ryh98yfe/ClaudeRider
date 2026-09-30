// race.final_lap: fanfare stinger (square brass triad, 0.8 s)
import { defineSfx, env, osc, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'race.final_lap', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const brass = (f: number, at: number, dur: number, g: number): number => {
      const e = env(ac, out, at, 0.02, dur, 0.6, 0.12, g, dur * 0.5);
      const f1 = lp(ac, 1400, 1.2, e.g, at);
      sweep(f1.frequency, 700, 2600, at, 0.08);
      osc(ac, 'square', f * P, at, e.end, f1); osc(ac, 'sawtooth', f * P, at, e.end, f1, 7);
      return e.end;
    };
    let end = t0;
    const seq: [number, number, number][] = [[523.3, 0, 0.12], [659.3, 0.12, 0.12], [784, 0.24, 0.5]];
    for (const [f, dt, d] of seq) end = Math.max(end, brass(f, t0 + dt, d, 0.06 * G), brass(f * 1.5, t0 + dt, d, 0.03 * G));
    return end;
  },
});
