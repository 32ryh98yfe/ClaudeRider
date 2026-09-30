// SFX recipe helpers (32-audio-spec §4 notation): osc(type, f), noise(color), env(a, d, s, r), bp/lp/hp(f, Q),
// sweep(f0 → f1, t), fm(carrier, ratio, index). Every helper schedules on the context clock from `t0` and
// stops its sources, so a one-shot graph frees itself. Gains are conservative (peaks ≤ −6 dBFS pre-bus).
import type { NoiseBank, SfxDef, SfxPlay, BusName } from '../api.ts';

export type Ctx = BaseAudioContext;

export function defineSfx(d: { id: string; bus: BusName; maxVoices: number; spatial: boolean; priority?: number; play: (ac: Ctx, out: AudioNode, o: SfxPlay) => number }): SfxDef { return d; }

/** Gain node → dest with an ADSR on its gain: attack linear to `peak`, exponential decay to `s·peak`, hold, release. */
export function env(ac: Ctx, dest: AudioNode, t0: number, a: number, d: number, s: number, r: number, peak: number, hold = 0): { g: GainNode; end: number } {
  const g = ac.createGain();
  const p = g.gain;
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(peak, t0 + Math.max(0.001, a));
  const sus = Math.max(1e-4, s * peak);
  p.exponentialRampToValueAtTime(Math.max(1e-4, sus), t0 + a + Math.max(0.001, d));
  const relStart = t0 + a + d + hold;
  if (s > 0 && hold > 0) p.setValueAtTime(sus, relStart);
  p.exponentialRampToValueAtTime(1e-4, relStart + Math.max(0.005, r));
  p.setValueAtTime(0, relStart + Math.max(0.005, r) + 0.002);
  g.connect(dest);
  return { g, end: relStart + r + 0.01 };
}

/** Percussive envelope shorthand: env(attack, decay, 0, 0). */
export function perc(ac: Ctx, dest: AudioNode, t0: number, a: number, dcy: number, peak: number): { g: GainNode; end: number } {
  return env(ac, dest, t0, a, dcy, 0, 0.01, peak);
}

export function osc(ac: Ctx, type: OscillatorType, f: number, t0: number, end: number, dest: AudioNode, detuneCents = 0): OscillatorNode {
  const o = ac.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (detuneCents) o.detune.setValueAtTime(detuneCents, t0);
  o.connect(dest);
  o.start(t0); o.stop(end + 0.02);
  return o;
}

export function noise(ac: Ctx, bank: NoiseBank, color: keyof NoiseBank, t0: number, end: number, dest: AudioNode, rate = 1): AudioBufferSourceNode {
  const s = ac.createBufferSource();
  s.buffer = bank[color]; s.loop = true; s.playbackRate.value = rate;
  // random offset so repeated hits never sound identical
  s.connect(dest);
  s.start(t0, Math.random() * 1.5); s.stop(end + 0.02);
  return s;
}

export function filt(ac: Ctx, type: BiquadFilterType, f: number, Q: number, dest: AudioNode, t0 = 0): BiquadFilterNode {
  const b = ac.createBiquadFilter();
  b.type = type; b.frequency.setValueAtTime(f, t0); b.Q.setValueAtTime(Q, t0);
  b.connect(dest);
  return b;
}
export const bp = (ac: Ctx, f: number, Q: number, dest: AudioNode, t0 = 0): BiquadFilterNode => filt(ac, 'bandpass', f, Q, dest, t0);
export const lp = (ac: Ctx, f: number, Q: number, dest: AudioNode, t0 = 0): BiquadFilterNode => filt(ac, 'lowpass', f, Q, dest, t0);
export const hp = (ac: Ctx, f: number, Q: number, dest: AudioNode, t0 = 0): BiquadFilterNode => filt(ac, 'highpass', f, Q, dest, t0);

/** Exponential sweep of an AudioParam (frequency) from f0 to f1 over `dur`. */
export function sweep(p: AudioParam, f0: number, f1: number, t0: number, dur: number): void {
  p.setValueAtTime(Math.max(1, f0), t0);
  p.exponentialRampToValueAtTime(Math.max(1, f1), t0 + Math.max(0.005, dur));
}

/** FM pair: carrier `f` with a sine modulator at `f·ratio`, depth `index·f·ratio` Hz. */
export function fm(ac: Ctx, f: number, ratio: number, index: number, t0: number, end: number, dest: AudioNode, type: OscillatorType = 'sine'): { car: OscillatorNode; mod: OscillatorNode; depth: GainNode } {
  const car = osc(ac, type, f, t0, end, dest);
  const mod = ac.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(f * ratio, t0);
  const depth = ac.createGain(); depth.gain.setValueAtTime(index * f * ratio, t0);
  mod.connect(depth).connect(car.frequency);
  mod.start(t0); mod.stop(end + 0.02);
  return { car, mod, depth };
}

/** Low-frequency modulation of a param: sine LFO at `hz` with ± `depth` around its current value. */
export function lfo(ac: Ctx, target: AudioParam, hz: number, depth: number, t0: number, end: number, type: OscillatorType = 'sine'): OscillatorNode {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(hz, t0);
  const g = ac.createGain(); g.gain.setValueAtTime(depth, t0);
  o.connect(g).connect(target);
  o.start(t0); o.stop(end + 0.02);
  return o;
}

/** Plays a short tone with its own percussive envelope; returns the end time. */
export function tone(ac: Ctx, dest: AudioNode, type: OscillatorType, f: number, t0: number, dur: number, peak: number, a = 0.004): number {
  const e = env(ac, dest, t0, a, dur, 0, 0.02, peak);
  osc(ac, type, f, t0, e.end, e.g);
  return e.end;
}

/** Noise burst through a filter with a percussive envelope; returns the end time. */
export function burst(ac: Ctx, o: SfxPlay, dest: AudioNode, color: keyof NoiseBank, type: BiquadFilterType, f: number, Q: number, t0: number, dur: number, peak: number): number {
  const e = env(ac, dest, t0, 0.002, dur, 0, 0.02, peak);
  const fl = filt(ac, type, f, Q, e.g, t0);
  noise(ac, o.noise, color, t0, e.end, fl);
  return e.end;
}

/** A short arpeggio of sine/triangle notes (frequencies in Hz); returns the end time. */
export function arp(ac: Ctx, dest: AudioNode, type: OscillatorType, freqs: readonly number[], t0: number, step: number, dur: number, peak: number): number {
  let end = t0;
  for (let i = 0; i < freqs.length; i++) end = Math.max(end, tone(ac, dest, type, freqs[i]!, t0 + i * step, dur, peak));
  return end;
}

export const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/** Deterministic-enough noise buffers (2 s mono): white, pink (Kellet), brown (integrated). */
export function makeNoiseBank(ac: Ctx): NoiseBank {
  const n = Math.floor(ac.sampleRate * 2);
  const white = ac.createBuffer(1, n, ac.sampleRate), pink = ac.createBuffer(1, n, ac.sampleRate), brown = ac.createBuffer(1, n, ac.sampleRate);
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  let s = 0x2545f491;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const x = ((s >>> 0) / 4294967296) * 2 - 1;
    w[i] = x * 0.9;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02; b[i] = last * 3.2;
  }
  return { white, pink, brown };
}
