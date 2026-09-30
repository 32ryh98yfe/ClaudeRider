// haz.telegraph: warning ping 1 kHz ×3 during the telegraph
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'haz.telegraph', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = t0;
    for (let i = 0; i < 3; i++) end = Math.max(end, tone(ac, out, 'sine', 1000 * P, t0 + i * 0.15, 0.06, 0.12 * G, 0.002));
    return end;
  },
});
