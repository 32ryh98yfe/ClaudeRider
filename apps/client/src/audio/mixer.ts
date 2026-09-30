// Mixer (32-audio-spec §2): buses → master → compressor (−18 dB, 3:1, 10/150 ms) → limiter → soft clip at −1 dBFS.
// Default levels: sfx 0 dB, engine −6 dB, music −14 dB, ui −10 dB, voice −3 dB. Settings sliders (0..1) map to
// gain = v²·2. Music gets a duck stage, a high-pass (boost whoosh) and a low-pass (final-lap sweep, redaction).
// A 32-voice budget with per-SFX polyphony caps and priority stealing.
import type { BusName } from './api.ts';

export const BUS_DB: Record<Exclude<BusName, 'master'>, number> = { sfx: 0, engine: -6, music: -14, ui: -10, voice: -3 };
export const CEILING = 0.891; // −1 dBFS
export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const sliderGain = (v: number): number => Math.max(0, v) * Math.max(0, v) * 2;

export interface Voice { id: string; gain: GainNode; end: number; priority: number; dist: number }

/** Soft clipper curve: linear below 0.7·ceiling, tanh knee up to the ceiling. */
export function clipCurve(n = 2048, ceiling = CEILING): Float32Array {
  const c = new Float32Array(n);
  const knee = ceiling * 0.7;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + (ceiling - knee) * Math.tanh((ax - knee) / (ceiling - knee));
    c[i] = Math.sign(x) * Math.min(ceiling, y);
  }
  return c;
}

export class Mixer {
  readonly ac: BaseAudioContext;
  readonly master: GainNode;
  readonly buses: Record<BusName, GainNode>;
  /** Music path: bus → duck → high-pass → low-pass → master. Songs connect to `buses.music`. */
  readonly musicDuck: GainNode; readonly musicHp: BiquadFilterNode; readonly musicLp: BiquadFilterNode;
  readonly comp: DynamicsCompressorNode; readonly limiter: DynamicsCompressorNode; readonly clip: WaveShaperNode;
  private ducks = new Map<string, { db: number; until: number }>();
  private voices: Voice[] = [];
  private perId = new Map<string, number>();
  private muted = { music: false, sfx: false, focus: false };
  private levels: Record<BusName, number> = { master: 1, music: 1, sfx: 1, engine: 1, ui: 1, voice: 1 };
  maxVoices = 32;

  constructor(ac: BaseAudioContext) {
    this.ac = ac;
    const g = (): GainNode => ac.createGain();
    this.master = g();
    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.ratio.value = 3; this.comp.attack.value = 0.01; this.comp.release.value = 0.15; this.comp.knee.value = 6;
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -3; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.06; this.limiter.knee.value = 0;
    this.clip = ac.createWaveShaper();
    this.clip.curve = clipCurve() as Float32Array<ArrayBuffer>;
    this.clip.oversample = '2x';
    this.master.connect(this.comp).connect(this.limiter).connect(this.clip).connect(ac.destination);
    this.buses = { master: this.master, music: g(), sfx: g(), engine: g(), ui: g(), voice: g() };
    this.musicDuck = g();
    this.musicHp = ac.createBiquadFilter(); this.musicHp.type = 'highpass'; this.musicHp.frequency.value = 10; this.musicHp.Q.value = 0.7;
    this.musicLp = ac.createBiquadFilter(); this.musicLp.type = 'lowpass'; this.musicLp.frequency.value = 20000; this.musicLp.Q.value = 0.7;
    this.buses.music.connect(this.musicDuck).connect(this.musicHp).connect(this.musicLp).connect(this.master);
    for (const b of ['sfx', 'engine', 'ui', 'voice'] as const) this.buses[b].connect(this.master);
    this.apply(0);
  }

  /** Settings volumes (0..1 sliders). `voice` follows sfx (SettingsV1 has no voice slider). */
  setVolumes(v: { master: number; music: number; sfx: number; engine: number; ui: number }): void {
    this.levels.master = sliderGain(v.master); this.levels.music = sliderGain(v.music); this.levels.sfx = sliderGain(v.sfx);
    this.levels.engine = sliderGain(v.engine); this.levels.ui = sliderGain(v.ui); this.levels.voice = sliderGain(v.sfx);
    this.apply(0.05);
  }
  setVolume(bus: BusName, v: number): void { this.levels[bus] = sliderGain(v); this.apply(0.05); }
  setMuted(k: 'music' | 'sfx' | 'focus', on: boolean): void { this.muted[k] = on; this.apply(0.08); }
  toggleMuted(k: 'music' | 'sfx'): boolean { this.muted[k] = !this.muted[k]; this.apply(0.08); return this.muted[k]; }

  private apply(tau: number): void {
    const t = this.ac.currentTime;
    const set = (n: GainNode, v: number): void => { if (tau <= 0) n.gain.value = v; else n.gain.setTargetAtTime(v, t, tau); };
    set(this.master, this.muted.focus ? 0 : this.levels.master);
    set(this.buses.music, this.muted.music ? 0 : this.levels.music * dbToGain(BUS_DB.music));
    const sfxOn = this.muted.sfx ? 0 : 1;
    set(this.buses.sfx, sfxOn * this.levels.sfx * dbToGain(BUS_DB.sfx));
    set(this.buses.engine, sfxOn * this.levels.engine * dbToGain(BUS_DB.engine));
    set(this.buses.ui, this.levels.ui * dbToGain(BUS_DB.ui));
    set(this.buses.voice, sfxOn * this.levels.voice * dbToGain(BUS_DB.voice));
  }

  /** Music duck by `db` (negative) for `sec` seconds (banners −4, boost −3, countdown −8, pause −12). Keyed so repeats refresh. */
  duck(key: string, db: number, sec: number): void {
    this.ducks.set(key, { db, until: this.ac.currentTime + sec });
    this.updateDuck();
  }
  unduck(key: string): void { this.ducks.delete(key); this.updateDuck(); }
  /** Call ~10×/s: expires ducks. */
  tick(): void {
    const t = this.ac.currentTime;
    let changed = false;
    for (const [k, d] of this.ducks) if (d.until <= t) { this.ducks.delete(k); changed = true; }
    if (changed) this.updateDuck();
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i]!.end <= t) this.dropVoice(i);
  }
  private updateDuck(): void {
    let db = 0;
    for (const d of this.ducks.values()) db = Math.min(db, d.db); // strongest duck wins (they do not stack)
    this.musicDuck.gain.setTargetAtTime(dbToGain(db), this.ac.currentTime, 0.08);
  }

  /** 300 ms high-pass whoosh on the music bus (boost start). */
  whoosh(): void {
    const t = this.ac.currentTime, f = this.musicHp.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(Math.max(10, f.value), t);
    f.exponentialRampToValueAtTime(900, t + 0.08); f.exponentialRampToValueAtTime(10, t + 0.3);
  }
  /** Music low-pass to `hz` for `sec`, then back open (redaction hit, pause); `sweepOpen` for the final-lap sweep. */
  muffle(hz: number, sec: number): void {
    const t = this.ac.currentTime, f = this.musicLp.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(hz, t + 0.08); f.setValueAtTime(hz, t + sec); f.exponentialRampToValueAtTime(20000, t + sec + 0.4);
  }
  sweepOpen(fromHz: number, sec: number): void {
    const t = this.ac.currentTime, f = this.musicLp.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(fromHz, t); f.exponentialRampToValueAtTime(20000, t + sec);
  }

  /**
   * Reserves a voice for SFX `id` (per-id polyphony cap, 32 total). Returns the voice gain to connect into, or
   * null when the voice budget refuses a lower-priority sound.
   */
  voice(id: string, maxPoly: number, priority: number, dist: number, dest: AudioNode): GainNode | null {
    const t = this.ac.currentTime;
    const n = this.perId.get(id) ?? 0;
    if (n >= maxPoly) {
      // steal the oldest voice of the same id (keeps rapid repeats responsive)
      let oldest = -1;
      for (let i = 0; i < this.voices.length; i++) if (this.voices[i]!.id === id && (oldest < 0 || this.voices[i]!.end < this.voices[oldest]!.end)) oldest = i;
      if (oldest >= 0) this.stealVoice(oldest, t); else return null;
    }
    if (this.voices.length >= this.maxVoices) {
      let worst = -1, worstScore = Infinity;
      for (let i = 0; i < this.voices.length; i++) { const v = this.voices[i]!; const s = v.priority * 1000 - v.dist; if (s < worstScore) { worstScore = s; worst = i; } }
      if (worst < 0 || worstScore > priority * 1000 - dist) return null;
      this.stealVoice(worst, t);
    }
    const g = this.ac.createGain();
    g.connect(dest);
    this.voices.push({ id, gain: g, end: t + 10, priority, dist });
    this.perId.set(id, (this.perId.get(id) ?? 0) + 1);
    return g;
  }
  /** Sets when a reserved voice ends (so the budget frees it and its graph is disconnected). */
  setVoiceEnd(g: GainNode, end: number): void { for (const v of this.voices) if (v.gain === g) { v.end = end + 0.05; return; } }
  activeVoices(): number { return this.voices.length; }

  private stealVoice(i: number, t: number): void {
    const v = this.voices[i]!;
    v.gain.gain.setTargetAtTime(0, t, 0.01);
    const g = v.gain;
    setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } }, 80);
    this.voices.splice(i, 1);
    this.perId.set(v.id, Math.max(0, (this.perId.get(v.id) ?? 1) - 1));
  }
  private dropVoice(i: number): void {
    const v = this.voices[i]!;
    try { v.gain.disconnect(); } catch { /* already gone */ }
    this.voices.splice(i, 1);
    this.perId.set(v.id, Math.max(0, (this.perId.get(v.id) ?? 1) - 1));
  }
}
