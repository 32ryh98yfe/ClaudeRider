// item.overclock_aura.use: two-tone synth siren 650/900 Hz alternating 0.3 s
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'item.overclock_aura.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = t0;
    for (let i = 0; i < 4; i++) end = Math.max(end, tone(ac, out, 'square', (i % 2 ? 900 : 650) * P, t0 + i * 0.3, 0.28, 0.06 * G, 0.01));
    return end;
  },
});
