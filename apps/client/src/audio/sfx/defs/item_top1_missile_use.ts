// item.top1_missile.use: distinct fanfare launch (brass triad + launch)
import { defineSfx, env, osc, lp, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.top1_missile.use', bus: 'sfx', maxVoices: 4, spatial: true,
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
    const n = burst(ac, o, out, 'white', 'lowpass', 2500, 0.7, t0, 0.15, 0.18 * G);
    let end = n;
    for (const [f, dt] of [[523.3, 0], [659.3, 0.1], [784, 0.2]] as const) end = Math.max(end, brass(f, t0 + dt, 0.3, 0.05 * G));
    return end;
  },
});
