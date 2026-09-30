// Vocoded synth barks without TTS (32-audio-spec §4.5): a saw carrier (220 Hz) through three formant band-passes
// that glide between phoneme targets, plus filtered-noise consonants. Robotic on purpose.
import type { SfxPlay } from '../api.ts';
import { env, noise, bp, hp, osc, type Ctx } from './lib.ts';

/** [duration s, F1, F2, F3, voiced amplitude 0..1, noise amplitude 0..1, pitch multiplier] */
export type Phone = readonly [number, number, number, number, number, number, number?];

export function speak(ac: Ctx, dest: AudioNode, o: SfxPlay, phones: readonly Phone[], basePitch = 220, peak = 0.5): number {
  const t0 = o.t0;
  let total = 0; for (const p of phones) total += p[0];
  const out = env(ac, dest, t0, 0.01, total, 0.9, 0.08, peak * o.gain, 0);
  const end = t0 + total + 0.12;
  const voiced = ac.createGain(); voiced.gain.setValueAtTime(0, t0);
  const car = osc(ac, 'sawtooth', basePitch * o.pitch, t0, end, voiced);
  const fGains = [1, 0.55, 0.3];
  const bands = [0, 1, 2].map((i) => { const f = bp(ac, phones[0]![1 + i]!, 9, out.g, t0); const g = ac.createGain(); g.gain.value = fGains[i]!; voiced.connect(g).connect(f); return f; });
  const hiss = ac.createGain(); hiss.gain.setValueAtTime(0, t0);
  noise(ac, o.noise, 'white', t0, end, hp(ac, 2500, 0.8, hiss, t0));
  hiss.connect(out.g);
  let t = t0;
  for (const p of phones) {
    const [dur, f1, f2, f3, va, na, pm] = p;
    const tt = t + dur * 0.35;
    bands[0]!.frequency.linearRampToValueAtTime(f1, tt); bands[1]!.frequency.linearRampToValueAtTime(f2, tt); bands[2]!.frequency.linearRampToValueAtTime(f3, tt);
    voiced.gain.linearRampToValueAtTime(va * 2.2, t + Math.min(0.02, dur * 0.3));
    hiss.gain.linearRampToValueAtTime(na * 0.6, t + Math.min(0.015, dur * 0.3));
    car.frequency.linearRampToValueAtTime(basePitch * o.pitch * (pm ?? 1), tt);
    t += dur;
  }
  voiced.gain.linearRampToValueAtTime(0, t + 0.05);
  hiss.gain.linearRampToValueAtTime(0, t + 0.03);
  return end;
}
