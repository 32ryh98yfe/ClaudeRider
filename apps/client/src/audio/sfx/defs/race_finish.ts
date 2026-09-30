// race.finish: fanfare; 1st: longer major cadence
import { defineSfx, env, osc, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'race.finish', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
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
    const win = k >= 0.5; // k = 1 for 1st place: longer major cadence
    const seq: [number, number, number][] = win ? [[523.3, 0, 0.14], [659.3, 0.14, 0.14], [784, 0.28, 0.14], [1046.5, 0.42, 0.7]] : [[587.3, 0, 0.16], [784, 0.16, 0.5]];
    let end = t0;
    for (const [f, dt, d] of seq) end = Math.max(end, brass(f, t0 + dt, d, 0.06 * G));
    return end;
  },
});
