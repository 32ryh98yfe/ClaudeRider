// jingle.final_lap: 2-bar brass stinger over the song (then the song continues at +6% tempo)
import { defineSfx, env, osc, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'jingle.final_lap', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
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
    // 2 bars of brass on top of the song (k: semitone transpose / 12 via pitch)
    const beat = 60 / 150;
    const seq: [number, number, number][] = [[392, 0, 0.5], [392, 0.5, 0.25], [523.3, 0.75, 0.25], [659.3, 1, 1], [587.3, 2, 0.5], [659.3, 2.5, 0.5], [784, 3, 1.5]];
    let end = t0;
    for (const [f, b, d] of seq) end = Math.max(end, brass(f, t0 + b * beat, d * beat, 0.07 * G), brass(f / 2, t0 + b * beat, d * beat, 0.04 * G));
    return end;
  },
});
