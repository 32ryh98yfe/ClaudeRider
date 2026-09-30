// jingle.finish_lose: 2-bar gentle resolution (4th–8th, retire)
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'jingle.finish_lose', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const beat = 60 / 100;
    let end = t0;
    for (const [f, b, d] of [[440, 0, 1], [392, 1, 1], [349.2, 2, 1], [392, 3, 2]] as const) end = Math.max(end, tone(ac, out, 'triangle', f * P, t0 + b * beat, d * beat, 0.12 * G, 0.02));
    for (const [f, b] of [[174.6, 0], [196, 2], [261.6, 3]] as const) end = Math.max(end, tone(ac, out, 'sine', f * P, t0 + b * beat, 1.8 * beat, 0.1 * G, 0.05));
    return end;
  },
});
