// kart.warp_enter: sweep 200 → 2000 Hz fm + reverse cymbal 0.8 s
import { defineSfx, env, noise, hp, sweep, fm } from '../lib.ts';

export default defineSfx({
  id: 'kart.warp_enter', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.05, 0.7, 0, 0.05, 0.14 * G);
    const f = fm(ac, 200 * P, 2, 3, t0, e.end, e.g);
    sweep(f.car.frequency, 200 * P, 2000 * P, t0, 0.7);
    // reverse cymbal: slow swell, instant cut
    const r = ac.createGain(); r.gain.setValueAtTime(0.0001, t0); r.gain.exponentialRampToValueAtTime(0.2 * G, t0 + 0.75); r.gain.setValueAtTime(0, t0 + 0.8);
    r.connect(out);
    noise(ac, o.noise, 'white', t0, t0 + 0.8, hp(ac, 5000, 0.7, r, t0));
    return t0 + 0.82;
  },
});
