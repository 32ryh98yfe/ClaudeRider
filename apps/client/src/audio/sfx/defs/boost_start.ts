// boost.start: chime (perfect 1320 + 1760 Hz; great 1175; good 988) + ignite (k = tier/2)
import { defineSfx, env, osc, noise, bp, sweep, tone } from '../lib.ts';

export default defineSfx({
  id: 'boost.start', bus: 'sfx', maxVoices: 1, spatial: false, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.32, 0, 0.05, 0.3 * G);
    const f = bp(ac, 200, 1.4, e.g, t0);
    sweep(f.frequency, 200, 4000, t0, 0.3);
    noise(ac, o.noise, 'white', t0, e.end, f);
    const th = env(ac, out, t0, 0.002, 0.25, 0, 0.03, 0.42 * G);
    const s = osc(ac, 'sine', 60 * P, t0, th.end, th.g);
    sweep(s.frequency, 90 * P, 45 * P, t0, 0.25);
    const tier = Math.round(k * 2); // 0 good · 1 great · 2 perfect
    const notes = tier >= 2 ? [1320, 1760] : tier === 1 ? [1175] : [988];
    let end = Math.max(e.end, th.end);
    for (const n of notes) end = Math.max(end, tone(ac, out, 'triangle', n * P, t0, 0.35, 0.14 * G));
    return end;
  },
});
