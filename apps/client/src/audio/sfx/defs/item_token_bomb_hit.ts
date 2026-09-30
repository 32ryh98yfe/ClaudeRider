// item.token_bomb.hit: pop + bubble loop (sine bursts 300–900 Hz random)
import { defineSfx, tone, burst } from '../lib.ts';

export default defineSfx({
  id: 'item.token_bomb.hit', bus: 'sfx', maxVoices: 4, spatial: true, priority: 1,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    const p = burst(ac, o, out, 'white', 'lowpass', 1800, 0.7, t0, 0.08, 0.3 * G);
    let end = p;
    for (let i = 0; i < 8; i++) end = Math.max(end, tone(ac, out, 'sine', (300 + Math.random() * 600) * P, t0 + 0.05 + i * 0.07, 0.05, 0.1 * G, 0.003));
    return end;
  },
});
