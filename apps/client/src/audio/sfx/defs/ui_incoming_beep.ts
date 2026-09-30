// ui.incoming_beep: warning beep 1.8 kHz, interval 24 → 5 ticks with ETA, panned toward the threat
import { defineSfx, tone } from '../lib.ts';

export default defineSfx({
  id: 'ui.incoming_beep', bus: 'ui', maxVoices: 2, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    // panned toward the threat: k = pan (−1 left … +1 right)
    const pan = ac.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, k * 2 - 1)); pan.connect(out);
    return tone(ac, pan, 'square', 1800 * P, t0, 0.05, 0.07 * G, 0.001);
  },
});
