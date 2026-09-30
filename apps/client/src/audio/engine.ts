// Audio facade (B11 AudioApi + the legacy calls the UI screens use): mixer, SFX registry with spatial voices,
// engine pool, race loops, ambience and the lazy Tone.js music director. No AudioContext exists before
// unlock() (the title screen's first gesture).
import { save } from '../meta/save.ts';
import type { AudioApi, BusName, EngineParams, MusicState, NoiseBank, SfxDef, SfxOpts, Vec3 } from './api.ts';
import { Mixer } from './mixer.ts';
import { makeNoiseBank } from './sfx/lib.ts';
import { sfxDef, sfxIds } from './sfx/registry.ts';
import { EnginePool, type EngineProfile, type EngineInput } from './engine-synth.ts';
import { listener, setListener as writeListener, applyListener, listenerDist } from './listener.ts';
import { MusicDirector } from './music/director.ts';

export type { BusName };

/** Legacy one-shot names (M1 UI code) → catalogue ids. */
const LEGACY: Record<string, [string, number?]> = {
  countdown: ['race.countdown_beep'], go: ['race.countdown_go'], boost: ['boost.ignite'], instant: ['boost.instant'], perfectStart: ['boost.start', 1],
  gauge: ['boost.gauge_full'], wall: ['kart.wall_hit_soft'], bump: ['kart.bump', 0.6], lap: ['race.lap'], finalLap: ['race.final_lap'], finish: ['race.finish', 1],
  wrongWay: ['race.wrong_way'], uiMove: ['ui.hover'], uiOk: ['ui.confirm'], box: ['item.box_break'], retire: ['race.retire'],
};

class AudioEngineImpl implements AudioApi {
  ctx: AudioContext | null = null;
  mixer: Mixer | null = null;
  noise: NoiseBank | null = null;
  director: MusicDirector | null = null;
  pool: EnginePool | null = null;
  unlocked = false;
  /** HRTF panners on Medium+; equal-power on Low (set by the renderer's tier). */
  hrtf = true;
  private unlocking: Promise<void> | null = null;
  private warned = new Set<string>();
  private tickTimer = 0;
  private einp: EngineInput = { speed: 0, throttle: 0, boost: false, drift: false, slip: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

  unlock(): Promise<void> {
    if (this.unlocked) return Promise.resolve();
    this.unlocking ??= this.doUnlock();
    return this.unlocking;
  }

  private async doUnlock(): Promise<void> {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.mixer = new Mixer(ctx);
    this.noise = makeNoiseBank(ctx);
    this.director = new MusicDirector(this.mixer, ctx, (id, o) => this.sfx(id, o));
    this.applyVolumes();
    save.subscribe(() => this.applyVolumes());
    document.addEventListener('visibilitychange', () => this.mixer?.setMuted('focus', document.hidden));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F7') { e.preventDefault(); this.mixer?.toggleMuted('music'); }
      if (e.code === 'F8') { e.preventDefault(); this.mixer?.toggleMuted('sfx'); }
    });
    this.tickTimer = window.setInterval(() => { this.mixer?.tick(); if (this.ctx) applyListener(this.ctx); }, 100);
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    this.unlocked = true;
    const w = window as unknown as { __cr?: Record<string, unknown> };
    w.__cr = { ...w.__cr, audio: { sfx: sfxIds().length, state: () => ({ ctx: ctx.state, voices: this.mixer?.activeVoices() ?? 0, song: this.director?.current() ?? null, music: this.director?.state }) } };
  }

  applyVolumes(): void { this.mixer?.setVolumes(save.get().settings.volume); }
  setVolume(bus: BusName, v: number): void { this.mixer?.setVolume(bus, v); }

  /** Plays a catalogue SFX (or a legacy M1 name). Spatial defs need `o.pos`; far sounds are culled. */
  sfx(id: string, o: SfxOpts = {}): void {
    const ac = this.ctx, mx = this.mixer, bank = this.noise;
    if (!ac || !mx || !bank) return;
    const legacy = LEGACY[id];
    if (legacy) { id = legacy[0]; if (o.k === undefined && legacy[1] !== undefined) o = { ...o, k: legacy[1] }; }
    const def: SfxDef | undefined = sfxDef(id);
    if (!def) { if (import.meta.env.DEV && !this.warned.has(id)) { this.warned.add(id); console.warn(`[audio] unknown sfx ${id}`); } return; }
    const bus = mx.buses[def.bus];
    let dest: AudioNode = bus, dist = 0, panner: PannerNode | null = null;
    if (def.spatial && o.pos && listener.valid) {
      dist = listenerDist(o.pos);
      if (dist > 160) return;
      panner = ac.createPanner();
      panner.panningModel = this.hrtf ? 'HRTF' : 'equalpower'; panner.distanceModel = 'inverse';
      panner.refDistance = 5; panner.rolloffFactor = 1.5; panner.maxDistance = 150;
      if (panner.positionX) { panner.positionX.value = o.pos.x; panner.positionY.value = o.pos.y; panner.positionZ.value = o.pos.z; }
      else (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(o.pos.x, o.pos.y, o.pos.z);
      panner.connect(bus);
      dest = panner;
    }
    const voice = mx.voice(id, def.maxVoices, def.priority ?? 0, dist, dest);
    if (!voice) { panner?.disconnect(); return; }
    const t0 = ac.currentTime + 0.005 + (o.delay ?? 0);
    let end = t0 + 1;
    try { end = def.play(ac, voice, { t0, gain: o.gain ?? 1, pitch: o.pitch ?? 1, k: o.k ?? 0, noise: bank }); }
    catch (e) { if (import.meta.env.DEV) console.warn(`[audio] sfx ${id} failed`, e); }
    mx.setVoiceEnd(voice, end);
    if (panner) { const p = panner; setTimeout(() => { try { p.disconnect(); } catch { /* gone */ } }, (end - ac.currentTime + 0.3) * 1000); }
  }

  engines = {
    attach: (slot: number, profile: EngineProfile): void => { this.ensurePool(); this.pool?.attach(slot, profile); },
    update: (slot: number, p: EngineParams): void => {
      const e = this.einp;
      e.speed = p.rpm01 * 44; e.throttle = p.throttle; e.boost = p.boost !== 0; e.drift = p.slip > 0.05; e.slip = p.slip;
      e.x = p.pos.x; e.y = p.pos.y; e.z = p.pos.z; e.vx = p.vel.x; e.vy = p.vel.y; e.vz = p.vel.z;
      this.pool?.update(slot, e);
    },
    detach: (slot: number): void => { this.pool?.detach(slot); },
  };

  ensurePool(): EnginePool | null {
    if (!this.pool && this.ctx && this.mixer && this.noise) this.pool = new EnginePool(this.ctx, this.mixer.buses.engine, this.noise, this.hrtf);
    return this.pool;
  }
  stopEngines(): void { this.pool?.stopAll(); this.pool = null; }

  music = {
    play: async (song: string, o?: { fadeSec?: number; variant?: 'a' | 'b' }): Promise<void> => { await this.unlock(); await this.director?.play(song, o); },
    setState: (s: MusicState): void => { this.director?.setState(s); },
    stop: (fadeSec?: number): void => { this.director?.stop(fadeSec); },
  };

  setListener(pos: Vec3, fwd: Vec3, up: Vec3, vel: Vec3): void { writeListener(pos, fwd, up, vel); }

  // ------------------------------------------------------------------ legacy M1 surface (UI screens)
  /** Lobby/results screens: M1 played a procedural loop; now the music director's lobby song. */
  playLoop(_bpm?: number, _root?: number, mood: 'lobby' | 'race' = 'lobby'): void {
    if (mood === 'lobby' && this.director && this.director.state !== 'race') this.director.setState('lobby');
  }
  stopLoop(): void { this.director?.stop(1.5); }
  startEngine(): void { this.ensurePool(); this.pool?.attach(-1, 'player'); }
  updateEngine(speed01: number, throttle: number, boosting: boolean, slip: number): void {
    const e = this.einp;
    e.speed = speed01 * 44; e.throttle = throttle; e.boost = boosting; e.drift = slip > 0.05; e.slip = slip;
    this.pool?.update(-1, e);
  }
  stopEngine(): void { this.pool?.detach(-1); }
  beep(freq: number, dur = 0.12, _type: OscillatorType = 'square', vol = 0.25, bus: BusName = 'sfx'): void {
    const ac = this.ctx, mx = this.mixer; if (!ac || !mx) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.005); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g).connect(mx.buses[bus]); o.start(t); o.stop(t + dur + 0.05);
  }

  dispose(): void { window.clearInterval(this.tickTimer); }
}

export const Audio = new AudioEngineImpl();
export type AudioEngine = AudioEngineImpl;
