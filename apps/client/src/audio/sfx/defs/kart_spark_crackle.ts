// kart.spark_crackle: random noise bursts (2–4 ms) high-passed 3 kHz
import { defineSfx, burst } from '../lib.ts';

export default defineSfx({
  id: 'kart.spark_crackle', bus: 'sfx', maxVoices: 8, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = t0;
    for (let i = 0; i < 3; i++) end = Math.max(end, burst(ac, o, out, 'white', 'highpass', 3000, 0.7, t0 + i * (0.012 + Math.random() * 0.02), 0.004, 0.12 * G));
    return end;
  },
});
