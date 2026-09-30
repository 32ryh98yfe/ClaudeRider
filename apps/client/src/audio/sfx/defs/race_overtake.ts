// race.overtake: short whoosh pan L → R
import { defineSfx, env, noise, bp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'race.overtake', bus: 'sfx', maxVoices: 2, spatial: false, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.04, 0.25, 0, 0.05, 0.16 * G);
    const pan = ac.createStereoPanner(); pan.pan.setValueAtTime(-0.8, t0); pan.pan.linearRampToValueAtTime(0.8, t0 + 0.3);
    e.g.disconnect(); e.g.connect(pan).connect(out);
    const f = bp(ac, 900, 1.3, e.g, t0);
    sweep(f.frequency, 700, 2600, t0, 0.3);
    noise(ac, o.noise, 'white', t0, e.end, f);
    return e.end;
  },
});
