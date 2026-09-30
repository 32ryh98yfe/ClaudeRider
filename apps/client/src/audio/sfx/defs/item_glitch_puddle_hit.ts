// item.glitch_puddle.hit: bit-crushed squelch (8-bit crusher on noise + saw)
import { defineSfx, env, osc, noise, lp, sweep } from '../lib.ts';

export default defineSfx({
  id: 'item.glitch_puddle.hit', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    // 8-bit crusher: a staircase wave shaper quantizes noise + saw
    const crush = ac.createWaveShaper(); const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) c[i] = Math.round(((i / 255) * 2 - 1) * 8) / 8;
    crush.curve = c;
    const e = env(ac, out, t0, 0.005, 0.35, 0, 0.05, 0.12 * G);
    crush.connect(e.g);
    const s = osc(ac, 'sawtooth', 300 * P, t0, e.end, crush);
    sweep(s.frequency, 600 * P, 120 * P, t0, 0.35);
    noise(ac, o.noise, 'white', t0, e.end, lp(ac, 3000, 0.7, crush, t0));
    return e.end;
  },
});
