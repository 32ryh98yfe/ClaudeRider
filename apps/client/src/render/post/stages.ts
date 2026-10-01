// Contracts between the post chain (S-Post) and the lighting stages written by S-Light (33-ultra-graphics §4).
// The chain builds its graph once per scene; stages return TSL nodes and keep their per-frame state in uniforms.
import type * as THREE from 'three/webgpu';
import type { TierSettings, Backend } from '../quality.ts';
import type { Environment } from '../env/environment.ts';
import type { CamMode } from '../camera/CameraDirector.ts';

type N = any;

/** What a stage may read. `normal`/`velocity` exist only with `ts.prepass`. */
export interface PostIO {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  env: Environment;
  ts: TierSettings;
  backend: Backend;
  /** Depth texture node of the prepass (Ultra) or of the scene pass. */
  depth: N;
  /** View-space Z node (negative in front of the camera). */
  viewZ: N;
  normal: N | null;
  velocity: N | null;
}

/** An HDR-space stage inserted after the scene pass, before TRAA (linear, pre-exposure radiance in, same out). */
export interface HdrStage {
  apply(hdr: N, io: PostIO): N;
  /** Called after the post chain warmed the scene (shadow maps exist then): swap placeholder textures for real ones. */
  bind?(io: PostIO): void;
  /** Per frame, before render. No allocation. */
  update?(dt: number): void;
  dispose(): void;
}

export type HdrStageFactory = (io: PostIO) => HdrStage | null;

/** Per-frame inputs RaceRenderer hands the post chain (camera mode drives DoF focus, cuts reset temporal history). */
export interface PostFrameInput {
  dt: number;
  camMode: CamMode;
  /** Increments on every camera cut or teleport: TRAA history and motion blur reset when it changes. */
  cutSerial: number;
  /** World point to focus on (the local kart), or null. */
  focus: THREE.Vector3 | null;
  reducedMotion: boolean;
}
