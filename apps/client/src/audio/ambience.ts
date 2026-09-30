// Per-theme ambience (32-audio-spec §4.5 amb.*): a filtered-noise bed plus sparse scheduled events
// (birds, bells, drips, crickets, gulls, crowd swells, orbital beeps) at −12 dB under the SFX bus.
import type { NoiseBank } from './api.ts';
import { NoiseLoop } from './loops.ts';
import { env, osc, sweep, lfo, fm, burst, type Ctx } from './sfx/lib.ts';

type EventFn = (ac: Ctx, out: AudioNode, t0: number, bank: NoiseBank) => void;
interface AmbRecipe { bed: [keyof NoiseBank, BiquadFilterType, number, number, number, number?]; events: { every: [number, number]; fn: EventFn }[] }

const chirp: EventFn = (ac, out, t0) => {
  const n = 2 + Math.floor(Math.random() * 4), base = 2200 + Math.random() * 1800;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.07 + Math.random() * 0.05);
    const e = env(ac, out, t, 0.005, 0.05, 0, 0.02, 0.05);
    const s = osc(ac, 'sine', base, t, e.end, e.g); sweep(s.frequency, base, base * (1.2 + Math.random() * 0.4), t, 0.05);
  }
};
const bell: EventFn = (ac, out, t0) => { const e = env(ac, out, t0, 0.002, 2.2, 0, 0.3, 0.04); fm(ac, 520 + Math.random() * 120, 2.76, 2.5, t0, e.end, e.g); };
const tinkle: EventFn = (ac, out, t0) => { for (let i = 0; i < 3; i++) { const t = t0 + i * 0.09; const e = env(ac, out, t, 0.002, 0.4, 0, 0.05, 0.03); osc(ac, 'sine', 3000 + Math.random() * 2500, t, e.end, e.g); } };
const drip: EventFn = (ac, out, t0) => { const e = env(ac, out, t0, 0.002, 0.08, 0, 0.02, 0.07); const s = osc(ac, 'sine', 900 + Math.random() * 500, t0, e.end, e.g); sweep(s.frequency, 1200, 500, t0, 0.08); };
const cricket: EventFn = (ac, out, t0) => { const e = env(ac, out, t0, 0.01, 0.35, 0.8, 0.05, 0.025, 0.2); const s = osc(ac, 'sine', 4200 + Math.random() * 300, t0, e.end, e.g); void s; lfo(ac, e.g.gain, 30, 0.02, t0, e.end, 'square'); };
const owl: EventFn = (ac, out, t0) => { for (const [dt, f] of [[0, 410], [0.45, 360]] as const) { const e = env(ac, out, t0 + dt, 0.05, 0.3, 0, 0.1, 0.05); const s = osc(ac, 'sine', f, t0 + dt, e.end, e.g); lfo(ac, s.frequency, 6, 8, t0 + dt, e.end); } };
const gull: EventFn = (ac, out, t0) => { for (let i = 0; i < 2; i++) { const t = t0 + i * 0.3; const e = env(ac, out, t, 0.02, 0.22, 0, 0.05, 0.04); const s = osc(ac, 'sawtooth', 1200, t, e.end, e.g); sweep(s.frequency, 1300, 2100, t, 0.1); s.frequency.exponentialRampToValueAtTime(1000, t + 0.22); } };
const swell = (f: number, g: number, dur: number): EventFn => (ac, out, t0, bank) => { void bank; const o = { t0, gain: 1, pitch: 1, k: 0, noise: bank }; burst(ac, o, out, 'pink', 'bandpass', f, 0.8, t0, dur, g); };
const beep: EventFn = (ac, out, t0) => { const e = env(ac, out, t0, 0.002, 0.08, 0, 0.02, 0.03); osc(ac, 'square', 1800 + Math.round(Math.random() * 3) * 300, t0, e.end, e.g); };

const RECIPES: Record<string, AmbRecipe> = {
  clayhill_village: { bed: ['pink', 'lowpass', 700, 0.7, 0.05], events: [{ every: [0.8, 3], fn: chirp }, { every: [9, 16], fn: bell }] },
  sunstone_desert: { bed: ['pink', 'bandpass', 500, 0.6, 0.12, 0.08], events: [{ every: [4, 9], fn: swell(1800, 0.05, 1.5) }] },
  frostbyte_glacier: { bed: ['pink', 'bandpass', 650, 0.7, 0.12, 0.1], events: [{ every: [2, 5], fn: tinkle }] },
  canopy_forest: { bed: ['white', 'highpass', 1500, 0.5, 0.04], events: [{ every: [0.6, 2.4], fn: chirp }] },
  ember_mine: { bed: ['brown', 'lowpass', 120, 0.8, 0.3], events: [{ every: [0.8, 2.5], fn: drip }] },
  lantern_hollow: { bed: ['pink', 'lowpass', 400, 0.7, 0.04], events: [{ every: [0.4, 1.4], fn: cricket }, { every: [8, 15], fn: owl }] },
  coral_cove: { bed: ['pink', 'lowpass', 900, 0.6, 0.14, 0.12], events: [{ every: [5, 11], fn: gull }] },
  neon_harbor: { bed: ['white', 'highpass', 3000, 0.6, 0.07], events: [{ every: [3, 7], fn: swell(300, 0.1, 2.5) }] },
  spark_circuit: { bed: ['pink', 'bandpass', 1000, 0.8, 0.06, 0.05], events: [{ every: [4, 9], fn: swell(1100, 0.08, 2) }] },
  orbital_nexus: { bed: ['brown', 'lowpass', 90, 0.8, 0.12], events: [{ every: [2, 6], fn: beep }] },
};

export class Ambience {
  private bed: NoiseLoop | null = null;
  private hum: OscillatorNode[] = [];
  private out: GainNode;
  private next: number[] = [];
  private r: AmbRecipe | null;
  private ac: BaseAudioContext; private bank: NoiseBank;

  constructor(ac: BaseAudioContext, dest: AudioNode, bank: NoiseBank, themeId: string) {
    this.ac = ac; this.bank = bank;
    this.out = ac.createGain(); this.out.gain.value = 0; this.out.connect(dest);
    this.out.gain.setTargetAtTime(0.25, ac.currentTime, 1.0); // −12 dB, faded in
    this.r = RECIPES[themeId] ?? null;
    if (this.r) {
      const [color, type, f, Q, g, am] = this.r.bed;
      this.bed = new NoiseLoop(ac, this.out, bank, color, type, f, Q, am ? { amHz: am, amDepth: 0.5 } : {});
      this.bed.set(g, undefined, 0.5);
      const t = ac.currentTime;
      this.next = this.r.events.map((e) => t + e.every[0] + Math.random() * (e.every[1] - e.every[0]));
    }
    if (themeId === 'orbital_nexus') {
      for (const f of [55, 82.4]) { const o = ac.createOscillator(); o.frequency.value = f; const g = ac.createGain(); g.gain.value = 0.05; o.connect(g).connect(this.out); o.start(); this.hum.push(o); }
    }
  }

  /** Schedules due events (call every frame or so). */
  tick(): void {
    const r = this.r; if (!r) return;
    const t = this.ac.currentTime;
    for (let i = 0; i < r.events.length; i++) {
      if (t + 0.1 < this.next[i]!) continue;
      const e = r.events[i]!;
      e.fn(this.ac, this.out, Math.max(t, this.next[i]!), this.bank);
      this.next[i] = t + e.every[0] + Math.random() * (e.every[1] - e.every[0]);
    }
  }

  stop(): void {
    const t = this.ac.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.3);
    this.bed?.stop();
    for (const o of this.hum) o.stop(t + 1.2);
    const out = this.out; setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, 1500);
    this.r = null;
  }
}
