// Continuous race loops (32-audio-spec §3.3, §4.1): drift screech, spark crackle, wall grind, surface beds
// (offroad, gravel, sand, snow, wood, metal, wet), draft wind, rail hum, trap wobble, drone wobble.
// Each loop is a filtered noise (or oscillator) bed with smoothed gain/frequency controls.
import type { NoiseBank } from './api.ts';

export class NoiseLoop {
  private ac: BaseAudioContext;
  readonly src: AudioBufferSourceNode;
  readonly filter: BiquadFilterNode;
  readonly g: GainNode;
  private am: GainNode | null = null; private lfo: OscillatorNode | null = null; private depth: GainNode | null = null;
  private gate: { lfo: OscillatorNode; shaper: WaveShaperNode } | null = null;
  private stopped = false;
  level = 0;

  constructor(ac: BaseAudioContext, dest: AudioNode, bank: NoiseBank, color: keyof NoiseBank, type: BiquadFilterType, f: number, Q: number, opts: { amHz?: number; amDepth?: number; pulses?: number } = {}) {
    this.ac = ac;
    const t = ac.currentTime;
    this.src = ac.createBufferSource(); this.src.buffer = bank[color]; this.src.loop = true;
    this.filter = ac.createBiquadFilter(); this.filter.type = type; this.filter.frequency.value = f; this.filter.Q.value = Q;
    this.g = ac.createGain(); this.g.gain.value = 0;
    let node: AudioNode = this.src.connect(this.filter);
    if (opts.amHz) {
      this.am = ac.createGain(); this.am.gain.value = 1 - (opts.amDepth ?? 0.3);
      this.lfo = ac.createOscillator(); this.lfo.frequency.value = opts.amHz;
      this.depth = ac.createGain(); this.depth.gain.value = opts.amDepth ?? 0.3;
      this.lfo.connect(this.depth).connect(this.am.gain); this.lfo.start(t);
      node = node.connect(this.am);
    }
    if (opts.pulses) {
      // crackle gate: a saw LFO through a threshold curve makes short pulses at the LFO rate
      const lfo = ac.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = opts.pulses;
      const shaper = ac.createWaveShaper(); const c = new Float32Array(256);
      for (let i = 0; i < 256; i++) c[i] = i > 240 ? 1 : 0;
      shaper.curve = c;
      const gate = ac.createGain(); gate.gain.value = 0;
      lfo.connect(shaper).connect(gate.gain); lfo.start(t);
      node = node.connect(gate); this.gate = { lfo, shaper };
    }
    node.connect(this.g).connect(dest);
    this.src.start(t, Math.random() * 1.5);
  }

  set(gain: number, freq?: number, tau = 0.05): void {
    if (this.stopped) return;
    const t = this.ac.currentTime;
    if (Math.abs(gain - this.level) > 1e-4) { this.g.gain.setTargetAtTime(gain, t, tau); this.level = gain; }
    if (freq !== undefined) this.filter.frequency.setTargetAtTime(freq, t, tau);
  }
  setRate(hz: number): void { if (this.gate) this.gate.lfo.frequency.setTargetAtTime(hz, this.ac.currentTime, 0.05); if (this.lfo) this.lfo.frequency.setTargetAtTime(hz, this.ac.currentTime, 0.1); }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ac.currentTime;
    this.g.gain.cancelScheduledValues(t); this.g.gain.setTargetAtTime(0, t, 0.05);
    this.src.stop(t + 0.3); this.lfo?.stop(t + 0.3); this.gate?.lfo.stop(t + 0.3);
    const g = this.g;
    setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 500);
  }
}

/** Oscillator bed (rail hum, drone wobble, trap wobble). */
export class ToneLoop {
  private ac: BaseAudioContext;
  readonly osc: OscillatorNode; readonly g: GainNode; readonly lp: BiquadFilterNode; private lfo: OscillatorNode; private depth: GainNode;
  private stopped = false; level = 0;
  constructor(ac: BaseAudioContext, dest: AudioNode, type: OscillatorType, f: number, cutoff: number, wobbleHz: number, wobbleCents: number) {
    this.ac = ac;
    const t = ac.currentTime;
    this.osc = ac.createOscillator(); this.osc.type = type; this.osc.frequency.value = f;
    this.lp = ac.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = cutoff;
    this.g = ac.createGain(); this.g.gain.value = 0;
    this.lfo = ac.createOscillator(); this.lfo.frequency.value = wobbleHz;
    this.depth = ac.createGain(); this.depth.gain.value = wobbleCents;
    this.lfo.connect(this.depth).connect(this.osc.detune);
    this.osc.connect(this.lp).connect(this.g).connect(dest);
    this.osc.start(t); this.lfo.start(t);
  }
  set(gain: number, freq?: number): void {
    if (this.stopped) return;
    const t = this.ac.currentTime;
    if (Math.abs(gain - this.level) > 1e-4) { this.g.gain.setTargetAtTime(gain, t, 0.06); this.level = gain; }
    if (freq !== undefined) this.osc.frequency.setTargetAtTime(freq, t, 0.05);
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ac.currentTime;
    this.g.gain.setTargetAtTime(0, t, 0.05); this.osc.stop(t + 0.3); this.lfo.stop(t + 0.3);
    const g = this.g; setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 500);
  }
}

/** The player's continuous loop set. */
export class RaceLoops {
  readonly screech: NoiseLoop; readonly crackle: NoiseLoop; readonly grind: NoiseLoop; readonly draft: NoiseLoop;
  readonly offroad: NoiseLoop; readonly gravel: NoiseLoop; readonly sand: NoiseLoop; readonly snow: NoiseLoop; readonly wet: NoiseLoop;
  readonly wood: NoiseLoop; readonly metal: NoiseLoop;
  readonly rail: ToneLoop; readonly trap: ToneLoop; readonly drone: ToneLoop;
  constructor(ac: BaseAudioContext, sfx: AudioNode, bank: NoiseBank) {
    this.screech = new NoiseLoop(ac, sfx, bank, 'white', 'bandpass', 1800, 3, { amHz: 7, amDepth: 0.3 });
    this.crackle = new NoiseLoop(ac, sfx, bank, 'white', 'highpass', 3000, 0.7, { pulses: 30 });
    this.grind = new NoiseLoop(ac, sfx, bank, 'brown', 'lowpass', 900, 0.8, { amHz: 23, amDepth: 0.2 });
    this.draft = new NoiseLoop(ac, sfx, bank, 'pink', 'lowpass', 500, 0.7);
    this.offroad = new NoiseLoop(ac, sfx, bank, 'brown', 'lowpass', 400, 0.7, { amHz: 8, amDepth: 0.35 });
    this.gravel = new NoiseLoop(ac, sfx, bank, 'white', 'bandpass', 1500, 1.2, { pulses: 40 });
    this.sand = new NoiseLoop(ac, sfx, bank, 'pink', 'lowpass', 1200, 0.7);
    this.snow = new NoiseLoop(ac, sfx, bank, 'white', 'bandpass', 3000, 1);
    this.wet = new NoiseLoop(ac, sfx, bank, 'white', 'highpass', 2000, 0.7);
    this.wood = new NoiseLoop(ac, sfx, bank, 'brown', 'bandpass', 180, 2, { pulses: 12 });
    this.metal = new NoiseLoop(ac, sfx, bank, 'white', 'bandpass', 1050, 6, { pulses: 14 });
    this.rail = new ToneLoop(ac, sfx, 'sawtooth', 110, 900, 5, 30);
    this.trap = new ToneLoop(ac, sfx, 'sine', 320, 2000, 5, 90);
    this.drone = new ToneLoop(ac, sfx, 'sawtooth', 90, 700, 6, 80);
  }
  all(): (NoiseLoop | ToneLoop)[] { return [this.screech, this.crackle, this.grind, this.draft, this.offroad, this.gravel, this.sand, this.snow, this.wet, this.wood, this.metal, this.rail, this.trap, this.drone]; }
  stop(): void { for (const l of this.all()) l.stop(); }
}
