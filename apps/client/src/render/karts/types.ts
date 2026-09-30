import type * as THREE from 'three/webgpu';

export interface Livery { primary: string; secondary: string; pattern: number; number: number }
export interface KartModel {
  root: THREE.Group;
  wheels: THREE.Object3D[];      // FL, FR, RL, RR
  steering: THREE.Object3D;
  seat: THREE.Object3D;          // mascot mount point
  exhausts: THREE.Object3D[];    // flame anchors (point along -Z)
  update(s: { steer: number; wheelSpin: number; boost: number; drift: boolean; speed: number }, dt: number): void;
  dispose(): void;
}
export interface KartBodyDef {
  id: string;
  dims: { length: number; width: number; height: number; wheelR: number };
  build(livery: Livery): KartModel;
}
