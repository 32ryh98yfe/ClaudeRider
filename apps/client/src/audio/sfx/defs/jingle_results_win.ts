// jingle.results_win: 4-bar results entry (win)
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'jingle.results_win', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const beat = 60 / 120;
    let end = t0;
    for (const [f, b] of [[523.3, 0], [659.3, 0.5], [784, 1], [1046.5, 1.5], [784, 2.5], [1046.5, 3], [1318.5, 3.5]] as const) end = Math.max(end, tone(ac, out, 'triangle', f * P, t0 + b * beat, 0.5 * beat, 0.12 * G, 0.01));
    for (const [f, b] of [[130.8, 0], [174.6, 2], [196, 4], [130.8, 6]] as const) end = Math.max(end, tone(ac, out, 'sine', f * P, t0 + b * beat, 1.9 * beat, 0.12 * G, 0.02));
    return end;
  },
});
