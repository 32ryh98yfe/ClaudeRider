// kart.wall_hit_hard: soft hit ×1.5 + crunch (noise bp 600 Hz 0.25 s) + 55 Hz sub
import { defineSfx, env, osc, sweep, burst } from '../lib.ts';

export default defineSfx({
  id: 'kart.wall_hit_hard', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const a = burst(ac, o, out, 'white', 'lowpass', 1800, 0.8, t0, 0.16, 0.34 * G);
    const b = burst(ac, o, out, 'white', 'bandpass', 600, 1.2, t0 + 0.01, 0.25, 0.3 * G);
    const e = env(ac, out, t0, 0.001, 0.25, 0, 0.03, 0.4 * G);
    const s = osc(ac, 'sine', 55 * P, t0, e.end, e.g);
    sweep(s.frequency, 90 * P, 45 * P, t0, 0.25);
    return Math.max(a, b, e.end);
  },
});
