// item.firewall.use: blocks thud ×3 + flame crackle
import { defineSfx, env, osc, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.firewall.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = t0;
    for (let i = 0; i < 3; i++) {
      const e = env(ac, out, t0 + i * 0.12, 0.002, 0.14, 0, 0.02, 0.35 * G);
      const s = osc(ac, 'sine', 80 * P, t0 + i * 0.12, e.end, e.g);
      sweep(s.frequency, 110 * P, 60 * P, t0 + i * 0.12, 0.14);
      end = Math.max(end, e.end);
    }
    for (let i = 0; i < 6; i++) end = Math.max(end, burst(ac, o, out, 'white', 'bandpass', 2500, 1, t0 + 0.3 + Math.random() * 0.5, 0.01, 0.1 * G));
    return end;
  },
});
