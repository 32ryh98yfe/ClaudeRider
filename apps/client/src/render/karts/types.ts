import type * as THREE from 'three/webgpu';

/** Livery (matches meta/save.ts): primary / secondary colours, pattern id (see LIVERY_PATTERNS), race number 0–99. */
export interface Livery { primary: string; secondary: string; pattern: number; number: number }

export interface KartUpdate {
  steer: number;          // −1..1, + = right
  wheelSpin: number;      // rad/s for a 0.22 m wheel (scaled per wheel radius internally)
  boost: number;          // BoostKind (0 = none)
  drift: boolean;
  speed: number;          // m/s
  // ---- optional (v1) ----
  airborne?: boolean;
  throttle?: number;      // 0..1
}

export interface KartModel {
  root: THREE.Group;
  wheels: THREE.Object3D[];      // FL, FR, RL, RR (bones: spin about local X)
  steering: THREE.Object3D;      // handlebar / wheel
  seat: THREE.Object3D;          // mascot mount point (mascot body centre, rig scale 0.62)
  exhausts: THREE.Object3D[];    // flame anchors (flames extend along −Z of the kart)
  update(s: KartUpdate, dt: number): void;
  dispose(): void;
  // ---- additive extensions (v1) ----
  readonly id: string;
  setLivery(l: Livery): void;
  setLod(l: 0 | 1 | 2): void;
  /** Distance-based LOD switching (default on, 25 m / 70 m). */
  setAutoLod(on: boolean, d1?: number, d2?: number): void;
  stats(): { tris: [number, number, number]; draws: [number, number, number] };
}

export type KartArchetype = 'speed' | 'balance' | 'drift';
export interface KartBodyDef {
  id: string;
  archetype: KartArchetype;
  dims: { length: number; width: number; height: number; wheelR: number };
  /** Default livery suggestion for this body (garage presets). */
  livery: Livery;
  build(livery: Livery): KartModel;
}
