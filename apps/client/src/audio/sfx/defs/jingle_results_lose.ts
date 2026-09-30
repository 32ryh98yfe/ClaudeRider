// jingle.results_lose: 2-bar results entry (lose)
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'jingle.results_lose', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const beat = 60 / 100;
    let end = t0;
    for (const [f, b] of [[392, 0], [349.2, 1], [329.6, 2], [293.7, 3]] as const) end = Math.max(end, tone(ac, out, 'triangle', f * P, t0 + b * beat, 0.9 * beat, 0.11 * G, 0.02));
    end = Math.max(end, tone(ac, out, 'sine', 146.8 * P, t0, 4 * beat, 0.1 * G, 0.1));
    return end;
  },
});
