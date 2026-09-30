// jingle.finish_win: 4-bar major fanfare (1st–3rd)
import { defineSfx, env, osc, lp, sweep, arp } from '../lib.ts';

export default defineSfx({
  id: 'jingle.finish_win', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
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
    const beat = 60 / 132;
    const seq: [number, number, number][] = [[523.3, 0, 0.5], [659.3, 0.5, 0.5], [784, 1, 0.5], [1046.5, 1.5, 1.5], [880, 3, 0.5], [1046.5, 3.5, 0.5], [1174.7, 4, 1], [1046.5, 5, 0.5], [1174.7, 5.5, 0.5], [1318.5, 6, 2.5]];
    let end = t0;
    for (const [f, b, d] of seq) end = Math.max(end, brass(f, t0 + b * beat, d * beat, 0.065 * G));
    for (const [f, b] of [[130.8, 0], [174.6, 4], [196, 6]] as const) end = Math.max(end, brass(f, t0 + b * beat, 1.8 * beat, 0.05 * G), brass(f * 1.5, t0 + b * beat, 1.8 * beat, 0.035 * G));
    end = Math.max(end, arp(ac, out, 'sine', [2093, 2637, 3136].map((x) => x * P), t0 + 6 * beat, 0.06, 0.4, 0.05 * G));
    return end;
  },
});
