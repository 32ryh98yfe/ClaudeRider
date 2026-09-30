// Web Audio engine (docs/design/32-audio-spec.md): buses, procedural kart engine, one-shot synth SFX.
// Tone.js music is loaded lazily by the music director (lane L11); M1 ships a light procedural lobby/race loop.
import { save } from '../meta/save.ts';

export type BusName = 'master' | 'music' | 'sfx' | 'engine' | 'ui';

class AudioEngineImpl {
  ctx: AudioContext | null = null;
  private buses = new Map<BusName, GainNode>();
  private engineNodes: { osc1: OscillatorNode; osc2: OscillatorNode; sub: OscillatorNode; filt: BiquadFilterNode; gain: GainNode; noise: AudioBufferSourceNode; noiseGain: GainNode; noiseFilt: BiquadFilterNode } | null = null;
  private screech: { gain: GainNode; filt: BiquadFilterNode } | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicStop: (() => void) | null = null;
  unlocked = false;

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
    master.connect(comp).connect(ctx.destination);
    this.buses.set('master', master);
    for (const b of ['music', 'sfx', 'engine', 'ui'] as BusName[]) { const g = ctx.createGain(); g.connect(master); this.buses.set(b, g); }
    const n = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    save.subscribe(() => this.applyVolumes());
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    this.unlocked = true;
  }

  applyVolumes(): void {
    const v = save.get().settings.volume;
    const set = (b: BusName, x: number): void => { const g = this.buses.get(b); if (g && this.ctx) g.gain.setTargetAtTime(x, this.ctx.currentTime, 0.05); };
    set('master', v.master); set('music', v.music * 0.55); set('sfx', v.sfx); set('engine', v.engine * 0.5); set('ui', v.ui);
  }

  private bus(b: BusName): AudioNode { return this.buses.get(b)!; }

  // ---------------------------------------------------------------- engine (player kart)
  startEngine(): void {
    const ctx = this.ctx; if (!ctx || this.engineNodes) return;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 800; filt.Q.value = 1.2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.detune.value = 7;
    const sub = ctx.createOscillator(); sub.type = 'sine';
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    const g3 = ctx.createGain(); g3.gain.value = 0.4;
    osc1.connect(shaper); osc2.connect(g2).connect(shaper); sub.connect(g3).connect(shaper);
    shaper.connect(filt).connect(gain).connect(this.bus('engine'));
    const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuf; noise.loop = true;
    const noiseFilt = ctx.createBiquadFilter(); noiseFilt.type = 'bandpass'; noiseFilt.frequency.value = 400; noiseFilt.Q.value = 2;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
    noise.connect(noiseFilt).connect(noiseGain).connect(this.bus('engine'));
    for (const o of [osc1, osc2, sub]) o.start();
    noise.start();
    this.engineNodes = { osc1, osc2, sub, filt, gain, noise, noiseGain, noiseFilt };
    // drift screech
    const sn = ctx.createBufferSource(); sn.buffer = this.noiseBuf; sn.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1800; sf.Q.value = 6;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sn.connect(sf).connect(sg).connect(this.bus('sfx'));
    sn.start();
    this.screech = { gain: sg, filt: sf };
  }

  updateEngine(speed01: number, throttle: number, boosting: boolean, slip: number): void {
    const ctx = this.ctx, e = this.engineNodes; if (!ctx || !e) return;
    const t = ctx.currentTime;
    // stylized 3-gear feel: RPM saw-tooth over speed
    const gears = 3.2;
    const g = Math.min(gears - 0.001, speed01 * gears);
    const rpm01 = 0.25 + 0.75 * (g - Math.floor(g));
    const f = (55 + 150 * rpm01 + 30 * speed01) * (boosting ? 1.15 : 1);
    e.osc1.frequency.setTargetAtTime(f, t, 0.04);
    e.osc2.frequency.setTargetAtTime(f * 2, t, 0.04);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.04);
    e.filt.frequency.setTargetAtTime(600 + 3000 * Math.max(throttle * 0.7, speed01 * 0.5) + (boosting ? 1500 : 0), t, 0.05);
    e.gain.gain.setTargetAtTime(0.16 + 0.12 * throttle, t, 0.06);
    e.noiseFilt.frequency.setTargetAtTime(f * 4, t, 0.05);
    e.noiseGain.gain.setTargetAtTime(0.02 + 0.05 * speed01, t, 0.08);
    if (this.screech) {
      const s = Math.min(1, slip * 3);
      this.screech.gain.gain.setTargetAtTime(s * 0.12, t, 0.05);
      this.screech.filt.frequency.setTargetAtTime(1400 + 900 * s + Math.sin(t * 50) * 200, t, 0.02);
    }
  }

  stopEngine(): void {
    const e = this.engineNodes; if (!e) return;
    for (const o of [e.osc1, e.osc2, e.sub]) o.stop();
    e.noise.stop();
    e.gain.disconnect();
    this.engineNodes = null;
    if (this.screech) { this.screech.gain.disconnect(); this.screech = null; }
  }

  // ---------------------------------------------------------------- one-shots
  beep(freq: number, dur = 0.12, type: OscillatorType = 'square', vol = 0.25, bus: BusName = 'sfx'): void {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus(bus));
    o.start(t); o.stop(t + dur + 0.05);
  }

  noiseSweep(f0: number, f1: number, dur: number, vol: number, bus: BusName = 'sfx'): void {
    const ctx = this.ctx; if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.bus(bus));
    s.start(t); s.stop(t + dur + 0.05);
  }

  thump(freq = 70, dur = 0.25, vol = 0.5): void {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq * 2, t); o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus('sfx'));
    o.start(t); o.stop(t + dur + 0.05);
  }

  sfx(id: string): void {
    switch (id) {
      case 'countdown': this.beep(440, 0.18, 'square', 0.22); break;
      case 'go': this.beep(880, 0.45, 'square', 0.25); this.beep(1320, 0.45, 'triangle', 0.12); break;
      case 'boost': this.noiseSweep(300, 4000, 0.45, 0.35); this.thump(60, 0.3, 0.45); break;
      case 'instant': this.beep(1175, 0.08, 'triangle', 0.18); setTimeout(() => this.beep(1568, 0.12, 'triangle', 0.18), 70); break;
      case 'perfectStart': this.beep(988, 0.1, 'triangle', 0.2); setTimeout(() => this.beep(1319, 0.1, 'triangle', 0.2), 90); setTimeout(() => this.beep(1760, 0.2, 'triangle', 0.2), 180); break;
      case 'gauge': this.beep(1760, 0.14, 'sine', 0.22); break;
      case 'wall': this.thump(90, 0.2, 0.55); this.noiseSweep(900, 200, 0.18, 0.25); break;
      case 'bump': this.thump(140, 0.12, 0.3); break;
      case 'lap': this.beep(784, 0.12, 'triangle', 0.2); setTimeout(() => this.beep(1047, 0.2, 'triangle', 0.2), 110); break;
      case 'finalLap': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'square', 0.16), i * 120)); break;
      case 'finish': [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => this.beep(f, 0.28, 'triangle', 0.2), i * 140)); break;
      case 'wrongWay': this.beep(220, 0.25, 'sawtooth', 0.15); break;
      case 'uiMove': this.beep(1400, 0.03, 'sine', 0.08, 'ui'); break;
      case 'uiOk': this.beep(880, 0.06, 'triangle', 0.14, 'ui'); setTimeout(() => this.beep(1320, 0.08, 'triangle', 0.12, 'ui'), 50); break;
      case 'box': this.beep(1320, 0.05, 'square', 0.1); break;
      case 'retire': this.beep(330, 0.08, 'square', 0.1); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- tiny procedural music loop (placeholder until L11 songs)
  playLoop(bpm: number, root = 57, mood: 'lobby' | 'race' = 'lobby'): void {
    this.stopLoop();
    const ctx = this.ctx; if (!ctx) return;
    const out = ctx.createGain(); out.gain.value = 0.9; out.connect(this.bus('music'));
    const step = 60 / bpm / 2;
    const prog = mood === 'lobby' ? [0, 5, 9, 7] : [0, 7, 9, 5];
    let i = 0, stopped = false;
    let next = ctx.currentTime + 0.1;
    const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
    const note = (f: number, t: number, dur: number, type: OscillatorType, vol: number): void => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    };
    const tick = (): void => {
      if (stopped) return;
      while (next < ctx.currentTime + 0.3) {
        const bar = Math.floor(i / 16) % 4, s16 = i % 16;
        const chord = root + prog[bar]!;
        if (s16 % 4 === 0) note(midi(chord - 24), next, step * 1.6, 'triangle', 0.16);          // bass
        if (s16 % 2 === 0) note(midi(chord + [0, 4, 7, 12][(i / 2) % 4]!), next, step * 0.9, 'sine', 0.05); // arp
        if (mood === 'race' && s16 % 4 === 2) note(9000, next, 0.03, 'square', 0.01);             // hat-ish tick
        if (s16 === 0 || s16 === 8) note(midi(chord + 12), next, step * 6, 'sine', 0.035);        // pad
        next += step; i++;
      }
      setTimeout(tick, 100);
    };
    tick();
    this.musicStop = () => { stopped = true; out.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => out.disconnect(), 1500); };
  }
  stopLoop(): void { if (this.musicStop) { this.musicStop(); this.musicStop = null; } }
}

export const Audio = new AudioEngineImpl();
