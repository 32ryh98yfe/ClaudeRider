// item.box_break: glass shatter (noise hp 4 kHz bursts ×6) + sparkle chime
import { defineSfx, burst, arp } from '../lib.ts';

export default defineSfx({
  id: 'item.box_break', bus: 'sfx', maxVoices: 4, spatial: true, priority: 2,
  play(ac, out, o) {
    const { t0 } = o, G = o.gain, P = o.pitch, k = o.k;
    void G; void P; void k;
    let end = t0;
    for (let i = 0; i < 6; i++) end = Math.max(end, burst(ac, o, out, 'white', 'highpass', 4000 + i * 400, 0.9, t0 + i * 0.018, 0.04, 0.14 * G));
    end = Math.max(end, arp(ac, out, 'sine', [1760 * P, 2349 * P, 2637 * P], t0 + 0.05, 0.05, 0.2, 0.08 * G));
    return end;
  },
});
