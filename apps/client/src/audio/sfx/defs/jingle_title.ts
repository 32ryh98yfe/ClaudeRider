// jingle.title: 2-bar title sting after "press any key"
import { defineSfx, env, osc, lp, sweep, arp } from '../lib.ts';

export default defineSfx({
  id: 'jingle.title', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
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
    const beat = 60 / 120;
    let end = t0;
    for (const [f, b, d] of [[587.3, 0, 0.5], [740, 0.5, 0.5], [880, 1, 2.5]] as const) end = Math.max(end, brass(f, t0 + b * beat, d * beat, 0.06 * G));
    end = Math.max(end, arp(ac, out, 'sine', [1760, 2217.5, 2637].map((x) => x * P), t0 + beat, 0.07, 0.4, 0.06 * G));
    return end;
  },
});
