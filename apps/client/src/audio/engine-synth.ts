// Engine synth (32-audio-spec §3): toy-range fundamental f0 = 55 + 180·rpm01 over 6 fake gears (the top one spans
// drag and tap boost, 46–54 m/s), shift dips, throttle-driven low-pass, rasp noise, boost jet roar, drift pitch
// +3 % with 6 Hz AM, throttle-off burble. Profiles: player (full graph, stereo), near (saw + square + low-pass,
// HRTF panner), far (single saw, equal-power pan, gain by distance, culled beyond 150 m). Doppler: f · c/(c − v_radial),
// clamped ±10 %.
import type { NoiseBank } from './api.ts';
import { listenerDist, listenerPan, radialSpeed } from './listener.ts';

export type EngineProfile = 'player' | 'near' | 'far';
export interface EngineInput { speed: number; throttle: number; boost: boolean; drift: boolean; slip: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }

/** Gear thresholds (m/s): 0–10, 10–20, 20–30, 30–38, 38–46, 46–54 (booster 45.1, drag 48.1, tap boost 50.6). */
export const GEARS = [0, 10, 20, 30, 38, 46, 54] as const;
/** EngineParams.rpm01 = speed / RPM_REF_MPS (1.0 just above the tap-boost cap, 50.6 m/s = 305 km/h). */
export const RPM_REF_MPS = 52;

/** rpm01 for a speed: idle 0.1 below 1 m/s; within a gear 0.3 + 0.7·(u − lo)/(hi − lo). Returns [rpm01, gear]. */
export function rpmFor(speed: number, out: [number, number]): [number, number] {
  const u = Math.abs(speed);
  if (u < 1) { out[0] = 0.1; out[1] = 0; return out; }
  let g = 0;
  while (g < GEARS.length - 2 && u >= GEARS[g + 1]!) g++;
  const lo = GEARS[g]!, hi = GEARS[g + 1]!;
  out[0] = Math.min(1, 0.3 + 0.7 * (u - lo) / (hi - lo)); out[1] = g;
  return out;
}
export const f0For = (rpm01: number): number => 55 + 180 * Math.max(0, Math.min(1, rpm01));

const C = 343;
const tanhCurve = (drive: number): Float32Array<ArrayBuffer> => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh(((i / 1023) * 2 - 1) * drive); return c; };

export class EngineVoice {
  readonly profile: EngineProfile;
  private ac: BaseAudioContext;
  private out: GainNode;
  private oscs: OscillatorNode[] = [];
  private saw: OscillatorNode; private saw2: OscillatorNode | null = null; private sq: OscillatorNode | null = null; private sub: OscillatorNode | null = null;
  private lp: BiquadFilterNode; private shift: GainNode; private am: GainNode | null = null; private amLfo: OscillatorNode | null = null; private amDepth: GainNode | null = null;
  private rasp: { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode } | null = null;
  private jet: { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode } | null = null;
  private panner: PannerNode | StereoPannerNode | null = null;
  private rpm: [number, number] = [0.1, 0];
  private gear = 0; private shiftT = 0;
  private stopped = false;
  private pos = { x: 0, y: 0, z: 0 }; private vel = { x: 0, y: 0, z: 0 };

  constructor(ac: BaseAudioContext, dest: AudioNode, profile: EngineProfile, noise: NoiseBank, hrtf: boolean) {
    this.ac = ac; this.profile = profile;
    const t = ac.currentTime;
    this.out = ac.createGain(); this.out.gain.value = 0;
    this.shift = ac.createGain(); this.shift.gain.value = 1;
    this.lp = ac.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 800; this.lp.Q.value = 1;
    const mk = (type: OscillatorType, f: number, detune = 0): OscillatorNode => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; this.oscs.push(o); return o; };
    this.saw = mk('sawtooth', 60);
    if (profile === 'player') {
      const shaper = ac.createWaveShaper(); shaper.curve = tanhCurve(1.5);
      const mix = ac.createGain(); mix.gain.value = 0.32;
      this.saw2 = mk('sawtooth', 60, 7);
      this.sq = mk('square', 120); const gq = ac.createGain(); gq.gain.value = 0.3;
      this.sub = mk('sine', 30); const gs = ac.createGain(); gs.gain.value = 0.4;
      this.saw.connect(mix); this.saw2.connect(mix); this.sq.connect(gq).connect(mix); this.sub.connect(gs).connect(mix);
      // AM stage for drift wobble (6 Hz) and throttle-off burble (2 Hz)
      this.am = ac.createGain(); this.am.gain.value = 1;
      this.amLfo = ac.createOscillator(); this.amLfo.frequency.value = 2; this.amDepth = ac.createGain(); this.amDepth.gain.value = 0;
      this.amLfo.connect(this.amDepth).connect(this.am.gain); this.oscs.push(this.amLfo);
      mix.connect(shaper).connect(this.lp).connect(this.am).connect(this.shift).connect(this.out);
      const noiseLayer = (f: number, q: number): { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode } => {
        const src = ac.createBufferSource(); src.buffer = noise.white; src.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const g = ac.createGain(); g.gain.value = 0;
        src.connect(bp).connect(g).connect(this.out); src.start(t, Math.random());
        return { src, bp, g };
      };
      this.rasp = noiseLayer(400, 2);
      this.jet = noiseLayer(1600, 0.9);
    } else if (profile === 'near') {
      this.sq = mk('square', 120); const gq = ac.createGain(); gq.gain.value = 0.3;
      const mix = ac.createGain(); mix.gain.value = 0.35;
      this.saw.connect(mix); this.sq.connect(gq).connect(mix);
      mix.connect(this.lp).connect(this.shift).connect(this.out);
    } else {
      const mix = ac.createGain(); mix.gain.value = 0.3;
      this.saw.connect(mix).connect(this.lp).connect(this.out);
      this.lp.frequency.value = 900;
    }
    let last: AudioNode = this.out;
    if (profile === 'near') {
      const p = ac.createPanner();
      p.panningModel = hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = 5; p.rolloffFactor = 1.5; p.maxDistance = 150;
      last.connect(p); last = p; this.panner = p;
    } else if (profile === 'far') {
      const p = ac.createStereoPanner(); last.connect(p); last = p; this.panner = p;
    }
    last.connect(dest);
    for (const o of this.oscs) o.start(t);
  }

  update(inp: EngineInput): void {
    if (this.stopped) return;
    const ac = this.ac, t = ac.currentTime;
    rpmFor(inp.speed, this.rpm);
    const [rpm01, gear] = this.rpm;
    if (gear !== this.gear) {
      // shift: 60 ms gain dip (rpm already drops ~30 % by the per-gear mapping)
      if (gear > this.gear) { this.shift.gain.cancelScheduledValues(t); this.shift.gain.setValueAtTime(1, t); this.shift.gain.linearRampToValueAtTime(0.55, t + 0.02); this.shift.gain.linearRampToValueAtTime(1, t + 0.08); }
      this.gear = gear; this.shiftT = 0.08;
    }
    let f = f0For(rpm01);
    if (inp.boost) f *= 1.15;
    if (inp.drift) f *= 1.03;
    let gain = 0.18 + 0.1 * inp.throttle;
    const pos = this.pos; pos.x = inp.x; pos.y = inp.y; pos.z = inp.z;
    if (this.profile !== 'player') {
      const vel = this.vel; vel.x = inp.vx; vel.y = inp.vy; vel.z = inp.vz;
      const v = radialSpeed(pos, vel);
      f *= Math.max(0.9, Math.min(1.1, C / (C - v)));
      const d = listenerDist(pos);
      if (this.profile === 'far') {
        gain *= d > 150 ? 0 : Math.max(0, 1 - d / 150) * 0.8;
        (this.panner as StereoPannerNode).pan.setTargetAtTime(listenerPan(pos), t, 0.05);
      } else {
        const p = this.panner as PannerNode;
        if (p.positionX) { p.positionX.setTargetAtTime(inp.x, t, 0.03); p.positionY.setTargetAtTime(inp.y, t, 0.03); p.positionZ.setTargetAtTime(inp.z, t, 0.03); }
        else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(inp.x, inp.y, inp.z);
      }
    }
    const tau = 0.04;
    this.saw.frequency.setTargetAtTime(f, t, tau);
    this.saw2?.frequency.setTargetAtTime(f, t, tau);
    this.sq?.frequency.setTargetAtTime(f * 2, t, tau);
    this.sub?.frequency.setTargetAtTime(f / 2, t, tau);
    const cutoff = this.profile === 'far' ? 700 + 900 * inp.throttle : 600 + 3000 * inp.throttle + (inp.boost ? 1200 : 0);
    this.lp.frequency.setTargetAtTime(cutoff, t, 0.05);
    this.out.gain.setTargetAtTime(gain, t, 0.05);
    if (this.rasp) { this.rasp.bp.frequency.setTargetAtTime(f * 4, t, tau); this.rasp.g.gain.setTargetAtTime((0.1 + 0.2 * inp.throttle) * 0.25, t, 0.05); }
    if (this.jet) { this.jet.g.gain.setTargetAtTime(inp.boost ? 0.3 * 0.3 : 0, t, 0.08); this.jet.bp.frequency.setTargetAtTime(inp.boost ? 800 + 2200 * Math.min(1, inp.speed / RPM_REF_MPS) : 1200, t, 0.1); }
    if (this.amLfo && this.amDepth) {
      // drift: 6 Hz wobble; throttle off: 2 Hz burble (depth 0.15)
      const hz = inp.drift ? 6 : 2, depth = inp.drift ? 0.12 : inp.throttle < 0.1 && inp.speed > 3 ? 0.15 : 0;
      this.amLfo.frequency.setTargetAtTime(hz, t, 0.05);
      this.amDepth.gain.setTargetAtTime(depth, t, 0.05);
    }
  }

  /** Current fundamental (tests). */
  f0(): number { return this.saw.frequency.value; }

  stop(fade = 0.15): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(0, t, fade / 3);
    for (const o of this.oscs) { try { o.stop(t + fade + 0.05); } catch { /* not started */ } }
    this.rasp?.src.stop(t + fade + 0.05); this.jet?.src.stop(t + fade + 0.05);
    const out = this.out, pan = this.panner;
    setTimeout(() => { try { out.disconnect(); pan?.disconnect(); } catch { /* gone */ } }, (fade + 0.2) * 1000);
  }
}

/** Player + nearest rivals: `detailed` of them get the near profile, the rest far. */
export class EnginePool {
  private voices = new Map<number, EngineVoice>();
  private ac: BaseAudioContext; private dest: AudioNode; private noise: NoiseBank; private hrtf: boolean;
  private order: number[] = []; private dist: Float64Array = new Float64Array(8);
  constructor(ac: BaseAudioContext, dest: AudioNode, noise: NoiseBank, hrtf: boolean) { this.ac = ac; this.dest = dest; this.noise = noise; this.hrtf = hrtf; }

  attach(slot: number, profile: EngineProfile): void {
    const cur = this.voices.get(slot);
    if (cur && cur.profile === profile) return;
    cur?.stop(0.1);
    this.voices.set(slot, new EngineVoice(this.ac, this.dest, profile, this.noise, this.hrtf));
  }
  detach(slot: number): void { this.voices.get(slot)?.stop(); this.voices.delete(slot); }
  update(slot: number, inp: EngineInput): void { this.voices.get(slot)?.update(inp); }
  has(slot: number): boolean { return this.voices.has(slot); }
  voiceOf(slot: number): EngineVoice | undefined { return this.voices.get(slot); }

  /**
   * Re-assigns rival voices to the nearest `rivals` karts (`near` for the first `detailed − 1`, `far` after).
   * `positions[i]` null = inactive. Call a few times per second.
   */
  assign(me: number, positions: readonly ({ x: number; y: number; z: number } | null)[], rivals: number, detailed: number): void {
    const order = this.order; order.length = 0;
    for (let i = 0; i < positions.length; i++) { const p = positions[i]; if (i === me || !p) continue; this.dist[i] = listenerDist(p); order.push(i); }
    order.sort((a, b) => this.dist[a]! - this.dist[b]!);
    const keep = new Set<number>([me]);
    for (let r = 0; r < Math.min(rivals, order.length); r++) {
      const s = order[r]!;
      if (this.dist[s]! > 150) break;
      keep.add(s);
      this.attach(s, r < detailed - 1 ? 'near' : 'far');
    }
    for (const s of [...this.voices.keys()]) if (!keep.has(s)) this.detach(s);
  }

  stopAll(): void { for (const v of this.voices.values()) v.stop(); this.voices.clear(); }
}
