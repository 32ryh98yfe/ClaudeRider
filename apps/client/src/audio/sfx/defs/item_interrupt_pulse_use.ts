// item.interrupt_pulse.use: band-pass noise sweep 300 → 5000 Hz, 0.4 s
import { defineSfx, env, noise, bp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'item.interrupt_pulse.use', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.02, 0.4, 0, 0.05, 0.22 * G);
    const f = bp(ac, 300, 3, e.g, t0);
    sweep(f.frequency, 300, 5000, t0, 0.4);
    noise(ac, o.noise, 'white', t0, e.end, f);
    return e.end;
  },
});
