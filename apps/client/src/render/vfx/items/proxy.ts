// Proxy assembly helpers shared by item VFX defs: lit + glow parts on two shared library materials.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { ProxyParts } from './geo.ts';
import type { ProjectileView, HazardView } from './api.ts';

export interface ProxyMeshes { root: THREE.Group; lit: THREE.Mesh | null; glow: THREE.Mesh | null }

/** Builds a proxy group; geometry is shared (pass cached parts), materials come from the library. */
export function makeProxy(parts: ProxyParts, name: string): ProxyMeshes {
  const root = new THREE.Group();
  root.name = `proxy:${name}`;
  const lit = parts.lit ? new THREE.Mesh(parts.lit, MaterialLibrary.vertexLit(0.5, 0.2)) : null;
  const glow = parts.glow ? new THREE.Mesh(parts.glow, MaterialLibrary.emissiveVertex(3)) : null;
  if (lit) { lit.castShadow = true; root.add(lit); }
  if (glow) root.add(glow);
  return { root, lit, glow };
}

/** Lazily built, shared geometry per item kind. */
export function once<T>(make: () => T): () => T { let v: T | null = null; return () => (v ??= make()); }

const tmp = new THREE.Vector3();
/** Places a projectile proxy at its interpolated position, nose along the travel direction. */
export function orient(root: THREE.Object3D, v: ProjectileView): void {
  root.position.set(v.x, v.y, v.z);
  tmp.set(v.x + v.dx, v.y + v.dy, v.z + v.dz);
  root.lookAt(tmp);
}

/** Places a hazard proxy at its position. */
export function placeHazard(root: THREE.Object3D, h: HazardView): void { root.position.set(h.x, h.y, h.z); }

/** 0 → 1 ease over `ticks` from `start` (e.g. firewall blocks dropping in). */
export function ease01(tick: number, start: number, ticks: number): number {
  const u = Math.min(1, Math.max(0, (tick - start) / Math.max(1, ticks)));
  return u * u * (3 - 2 * u);
}
