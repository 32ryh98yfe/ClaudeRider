// net.late_signal: glitchy descending blip (bit-crushed)
import { defineSfx, env, osc, sweep } from '../lib.ts';

export default defineSfx({
  id: 'net.late_signal', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const crush = ac.createWaveShaper(); const c = new Float32Array(64);
    for (let i = 0; i < 64; i++) c[i] = Math.round(((i / 63) * 2 - 1) * 4) / 4;
    crush.curve = c;
    const e = env(ac, out, t0, 0.003, 0.3, 0, 0.03, 0.1 * G);
    crush.connect(e.g);
    const s = osc(ac, 'square', 1400 * P, t0, e.end, crush);
    sweep(s.frequency, 1400 * P, 300 * P, t0, 0.3);
    return e.end;
  },
});
