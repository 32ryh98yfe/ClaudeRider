// kart.drag_start: drag (끌기) engages: airy hiss sweep hp 1.5 → 6 kHz 0.25 s + a glassy glint 1320 → 1760 Hz
import { defineSfx, env, noise, hp, sweep, tone } from '../lib.ts';

export default defineSfx({
  id: 'kart.drag_start', bus: 'sfx', maxVoices: 4, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.25, 0, 0.06, 0.16 * G);
    const f = hp(ac, 1500 * P, 0.9, e.g, t0);
    sweep(f.frequency, 1500 * P, 6000 * P, t0, 0.25);
    noise(ac, o.noise, 'white', t0, e.end, f);
    const a = tone(ac, out, 'sine', 1320 * P, t0 + 0.02, 0.07, 0.07 * G, 0.003);
    const b = tone(ac, out, 'sine', 1760 * P, t0 + 0.08, 0.14, 0.06 * G, 0.003);
    return Math.max(e.end, a, b);
  },
});
