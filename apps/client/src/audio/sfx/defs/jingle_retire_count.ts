// jingle.retire_count: 10 s loop: ticking percussion + suspended chord under the retire countdown
import { defineSfx, env, osc, lp, tone } from '../lib.ts';

export default defineSfx({
  id: 'jingle.retire_count', bus: 'music', maxVoices: 1, spatial: false, priority: 3,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    // 10 s: ticking percussion under a suspended chord
    let end = t0 + 10;
    for (let i = 0; i < 20; i++) end = Math.max(end, tone(ac, out, 'sine', (i % 4 === 0 ? 1600 : 1200) * P, t0 + i * 0.5, 0.02, 0.08 * G, 0.001));
    const pad = env(ac, out, t0, 1.5, 7, 0.8, 1.5, 0.05 * G, 1);
    const f = lp(ac, 1400, 0.7, pad.g, t0);
    for (const n of [293.7, 392, 440]) { osc(ac, 'sawtooth', n * P, t0, pad.end, f, 6); osc(ac, 'sawtooth', n * P, t0, pad.end, f, -6); }
    return Math.max(end, pad.end);
  },
});
