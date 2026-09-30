// haz.swinger: whoosh synced to the pendulum
import { defineSfx, env, noise, bp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'haz.swinger', bus: 'sfx', maxVoices: 4, spatial: true,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.25, 0.3, 0, 0.05, 0.16 * G);
    const f = bp(ac, 400, 1.2, e.g, t0); sweep(f.frequency, 300, 1400, t0, 0.3); f.frequency.exponentialRampToValueAtTime(300, t0 + 0.6);
    noise(ac, o.noise, 'white', t0, e.end, f);
    return e.end;
  },
});
