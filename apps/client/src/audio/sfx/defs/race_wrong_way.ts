// race.wrong_way: buzz: square 180 Hz pulsed at 2 Hz while shown
import { defineSfx, env, osc, lp } from '../lib.ts';

export default defineSfx({
  id: 'race.wrong_way', bus: 'ui', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const e = env(ac, out, t0, 0.01, 0.9, 0.9, 0.1, 0.1 * G, 0.1);
    osc(ac, 'square', 180 * P, t0, e.end, lp(ac, 1200, 0.7, e.g, t0));
    const am = ac.createGain(); am.gain.value = 0; e.g.disconnect(); e.g.connect(am).connect(out);
    const p = ac.createOscillator(); p.type = 'square'; p.frequency.value = 2; const d = ac.createGain(); d.gain.value = 0.5;
    const off = ac.createConstantSource(); off.offset.value = 0.5; off.connect(am.gain); p.connect(d).connect(am.gain);
    p.start(t0); p.stop(e.end); off.start(t0); off.stop(e.end);
    return e.end;
  },
});
