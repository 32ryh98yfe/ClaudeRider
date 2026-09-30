// item.mirror_mode.hit: reversed chime
import { defineSfx, osc } from '../lib.ts';

export default defineSfx({
  id: 'item.mirror_mode.hit', bus: 'ui', maxVoices: 1, spatial: false, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    // reversed chime: slow swell, abrupt stop
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.14 * G, t0 + 0.45); g.gain.setValueAtTime(0, t0 + 0.47);
    g.connect(out);
    osc(ac, 'sine', 1319 * P, t0, t0 + 0.47, g); osc(ac, 'sine', 1976 * P, t0, t0 + 0.47, g);
    return t0 + 0.5;
  },
});
