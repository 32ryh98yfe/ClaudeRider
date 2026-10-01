// Per-frame render systems (33-ultra-graphics §3). High and Ultra add terrain clipmaps, GPU grass, a far forest and
// weather without each feature editing RaceRenderer: every `render/systems/<name>.system.ts` default-exports a
// SystemFactory, and the registry lazy-loads them (Low and Medium never fetch the chunks).
import type * as THREE from 'three/webgpu';
import type { BakedTrack } from '@cr/sim';
import type { QualityTier, TierSettings, Backend } from '../quality.ts';
import type { ThemeKit } from '../themes/kit.ts';
import type { Environment } from '../env/environment.ts';
import type { EnvLook } from '../env/look.ts';
import type { TrackView, VisMeta } from '../track/TrackView.ts';
import type { KartPose } from '../vfx/driving.ts';
import type { GroundField } from '../ground/field.ts';

type N = any;

/**
 * Uniforms RaceRenderer refreshes once per frame, before any system update. Systems must read the camera position
 * from `mainCamPos`, never TSL `cameraPosition`: in shadow passes that is the light's camera.
 */
export interface SharedFrameUniforms {
  /** vec3: race camera world position this frame, and last frame (velocity of camera-relative placement). */
  mainCamPos: N; prevMainCamPos: N;
  /** uniformArray of 8 vec4: kart xyz + speed (m/s), w < 0 when that slot is hidden. */
  kartPos: N;
  /** float: render dt (s, slow motion applied) and render time (s). */
  dt: N; time: N;
  /** vec2 wind direction (unit, xz) and float strength (theme wind × gusts). */
  windDir: N; windStrength: N;
}

export interface FrameContext {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tier: QualityTier;
  ts: TierSettings;
  backend: Backend;
  kit: ThemeKit;
  look: EnvLook;
  env: Environment;
  track: BakedTrack;
  vis: ArrayBuffer;
  meta: VisMeta;
  view: TrackView;
  /** Terrain lattice + road distance (null when the tier loads no systems or the track has no .vis terrain). */
  ground: GroundField | null;
  /** Interpolated kart poses by slot (8 entries; `visible` false for empty slots). */
  poses: readonly KartPose[];
  localSlot: number;
  u: SharedFrameUniforms;
}

export interface FrameSystem {
  readonly id: string;
  /** Update order (ascending): terrain 10, ocean 15, grass 20, forest 30, weather 40. */
  readonly order: number;
  /** Builds GPU resources; runs after the track view and karts exist and before the post chain warms the shaders. */
  init?(c: FrameContext): Promise<void>;
  /** After the camera director moved the camera, before the frame renders. No allocation. */
  update(c: FrameContext, dt: number, t: number): void;
  dispose(): void;
}

/** A system module's default export; returns null when the system does not apply (tier, theme, missing data). */
export type SystemFactory = (c: FrameContext) => FrameSystem | null | Promise<FrameSystem | null>;
