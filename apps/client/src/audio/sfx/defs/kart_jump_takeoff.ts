// kart.jump_takeoff: noise hp sweep 500 → 2 kHz, 0.25 s
import { defineSfx, env, noise, hp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'kart.jump_takeoff', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.03, 0.22, 0, 0.03, 0.22 * G);
    const f = hp(ac, 500, 0.8, e.g, t0);
    sweep(f.frequency, 500, 2000, t0, 0.25);
    noise(ac, o.noise, 'white', t0, e.end, f);
    return e.end;
  },
});
