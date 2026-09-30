// Audio contract (02-contracts.md B11, 32-audio-spec.md). Everything is synthesized: Web Audio for engines and
// SFX, Tone.js (lazy chunk) for music.
import type { BoostKind } from '@cr/sim';

export type BusName = 'master' | 'music' | 'sfx' | 'engine' | 'ui' | 'voice';
export interface Vec3 { x: number; y: number; z: number }

export interface SfxOpts {
  /** World position for spatial sounds. */
  pos?: Vec3;
  /** Linear gain multiplier (default 1). */
  gain?: number;
  /** Pitch multiplier (default 1). */
  pitch?: number;
  /** Recipe-specific intensity 0..1 (impact, impulse, tier…). */
  k?: number;
  /** Start time offset in seconds from now. */
  delay?: number;
}

/** One file per SFX in audio/sfx/defs/<id>.ts. `play` builds a short-lived node graph into `dest` at `t0`. */
export interface SfxDef {
  id: string;
  bus: BusName;
  maxVoices: number;
  spatial: boolean;
  /** Voice priority: 3 UI, 2 local kart, 1 items targeting the local kart, 0 others (by distance). */
  priority?: number;
  /** Returns the time (s, context clock) at which the sound has fully ended. */
  play(ac: BaseAudioContext, dest: AudioNode, o: SfxPlay): number;
}
export interface SfxPlay extends Required<Pick<SfxOpts, 'gain' | 'pitch' | 'k'>> { t0: number; noise: NoiseBank }

/** Shared pre-rendered noise buffers (2 s each). */
export interface NoiseBank { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer }

/** Song stems follow 32-audio-spec §5: setIntensity 0 pads · 0.3 +bass · 0.6 +drums · 0.8 +harmony · 1.0 +lead. */
export interface SongHandle { start(): void; stop(): void; setIntensity(x: number): void; setTempoMul?(m: number, rampSec: number): void; addHats?(on: boolean): void }
export interface SongDef {
  id: string;
  bpm: number;
  /** Variant b tempo (second track of the theme). */
  bpmB?: number;
  build(T: ToneLib, out: ToneNodeLike, variant?: 'a' | 'b'): SongHandle;
}

/** The subset of Tone.js the songs use (classes + transport access), injected by the lazy loader. */
export type ToneLib = typeof import('tone/build/esm/classes.js') & {
  getTransport(): import('tone/build/esm/core/clock/Transport.js').TransportClass;
  now(): number;
};
export type ToneNodeLike = import('tone/build/esm/core/context/ToneAudioNode.js').ToneAudioNode;

export type MusicState = 'lobby' | 'race' | 'finalLap' | 'finish' | 'results';

export interface EngineParams { rpm01: number; throttle: number; boost: BoostKind; slip: number; pos: Vec3; vel: Vec3 }

export interface AudioApi {
  unlock(): Promise<void>;
  setVolume(bus: BusName, v: number): void;
  sfx(id: string, o?: SfxOpts): void;
  engines: { attach(slot: number, profile: 'player' | 'near' | 'far'): void; update(slot: number, p: EngineParams): void; detach(slot: number): void };
  music: { play(song: string, o?: { fadeSec?: number; variant?: 'a' | 'b' }): Promise<void>; setState(s: MusicState): void; stop(fadeSec?: number): void };
  setListener(pos: Vec3, fwd: Vec3, up: Vec3, vel: Vec3): void;
}
