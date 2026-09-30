// Item VFX contract (30-art-bible §10.2). One file per item in ./defs/<id>.ts exports an ItemVfxDef keyed by
// its presentation vfxKey (default `item.<ITEM_IDS name>`). Projectile and hazard proxies are driven by
// world.projectiles / world.hazards every frame; bursts come from de-duplicated SimEvents.
import type * as THREE from 'three/webgpu';
import type { GpuParticles } from '../gpuParticles.ts';
import type { KartPose } from '../driving.ts';

export interface ProjectileView {
  id: number; code: number; owner: number; target: number; phase: number;
  x: number; y: number; z: number;          // interpolated position
  dx: number; dy: number; dz: number;       // unit travel direction (or forward)
  spawn: number; impact: number; tick: number;
}
export interface HazardView { id: number; code: number; owner: number; x: number; y: number; z: number; radius: number; arm: number; expire: number; tick: number; armed: boolean }

export interface ProxyInstance {
  root: THREE.Object3D;
  /** Called every frame while the object exists (t = render seconds). */
  update(v: ProjectileView | HazardView, dt: number, t: number): void;
  dispose?(): void;
}

/** What item defs can draw with. */
export interface ItemFxCtx {
  sparks: GpuParticles; smoke: GpuParticles;
  local: number;
  stars(at: THREE.Vector3, n: number, color: string, speed: number): void;
  puff(at: THREE.Vector3, n: number, color: string, speed: number): void;
  flash(at: THREE.Vector3, color: string, size: number): void;
  ring(at: THREE.Vector3, color: string, size: number, life: number): void;
  shake(amp: number): void;
  postFlash(k: number): void;
  /** Screen flicker for broadcast-type items (0..1 for `sec`). */
  flicker(sec: number): void;
}

export interface ItemVfxDef {
  /** vfxKey, e.g. 'item.prompt_missile'. */
  key: string;
  projectile?(): ProxyInstance;
  hazard?(): ProxyInstance;
  /** Continuous particles for a live projectile / hazard (trails, clouds). */
  trail?(fx: ItemFxCtx, v: ProjectileView, dt: number): void;
  hazardFx?(fx: ItemFxCtx, h: HazardView, dt: number): void;
  use?(fx: ItemFxCtx, user: KartPose | null): void;
  impact?(fx: ItemFxCtx, at: THREE.Vector3): void;
}

export function defineItemVfx(d: ItemVfxDef): ItemVfxDef { return d; }
