// Render-only dressing must not imply an obstacle on the drivable road. This load-time check uses actual triangles,
// so an arch or tunnel with a clear opening survives even when its bounding box surrounds the whole road.
import * as THREE from 'three/webgpu';
import { SFLAG, type BakedTrack, type FrameSample } from '@cr/sim';

interface Corridor { frame: FrameSample; toLocal: THREE.Matrix4; box: THREE.Box3; radius: number; path: number; s: number }
export interface PropConflict { path: number; s: number }
const CELL = 24;
const F = (): FrameSample => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 });
const key = (x: number, z: number): string => `${x}:${z}`;

export class PropRoadClearance {
  private cells = new Map<string, Corridor[]>();
  private sphere = new THREE.Sphere();
  private matrix = new THREE.Matrix4();
  private triangle = new THREE.Triangle();
  private seen = new Set<Corridor>();
  private track: BakedTrack;
  private ground = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };

  constructor(track: BakedTrack) {
    this.track = track;
    for (let path = 0; path < track.nPaths; path++) {
      const p = track.path(path);
      if (p.kind === 'rail') continue;
      for (let s = 0; s <= p.length; s += 2) {
        const f = F(); track.frameAt(path, s, f);
        if ((f.flags & (SFLAG.WARP | SFLAG.NO_GROUND)) !== 0) continue;
        // Leave the outer metre for walls/kerbs. The protected prism covers the kart and driver's body.
        const box = new THREE.Box3(new THREE.Vector3(-Math.max(0.5, f.wL - 1), 0.35, -1.05), new THREE.Vector3(Math.max(0.5, f.wR - 1), 2.7, 1.05));
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.rx, f.ry, f.rz), new THREE.Vector3(f.ux, f.uy, f.uz), new THREE.Vector3(f.tx, f.ty, f.tz)).setPosition(f.px, f.py, f.pz);
        const world = box.clone().applyMatrix4(m), radius = Math.max(f.wL, f.wR) + 4;
        const c: Corridor = { frame: f, toLocal: m.invert(), box, radius, path, s };
        for (let x = Math.floor(world.min.x / CELL); x <= Math.floor(world.max.x / CELL); x++) for (let z = Math.floor(world.min.z / CELL); z <= Math.floor(world.max.z / CELL); z++) {
          const k = key(x, z); let list = this.cells.get(k); if (!list) { list = []; this.cells.set(k, list); } list.push(c);
        }
      }
    }
  }

  /** Generated column height classes used to round above the deck; cap them at the real supporting road. */
  fitPillar(geometry: THREE.BufferGeometry, position: THREE.Vector3, scale: THREE.Vector3): void {
    geometry.computeBoundingBox();
    const top = geometry.boundingBox!.max.y;
    if (top <= 0) return;
    const height = top * scale.y;
    if (this.track.groundRay(position.x, position.y + height + 2, position.z, 0, -1, 0, height + 2, this.ground)) {
      const clear = this.ground.y - position.y - 0.2;
      if (clear > 0) scale.y = Math.min(scale.y, clear / top);
    }
  }

  conflict(geometry: THREE.BufferGeometry, world: THREE.Matrix4): PropConflict | null {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    this.sphere.copy(geometry.boundingSphere!).applyMatrix4(world);
    const { center: p, radius: r } = this.sphere, tri = this.triangle, pos = geometry.getAttribute('position'), idx = geometry.index;
    this.seen.clear();
    for (let x = Math.floor((p.x - r) / CELL); x <= Math.floor((p.x + r) / CELL); x++) for (let z = Math.floor((p.z - r) / CELL); z <= Math.floor((p.z + r) / CELL); z++) {
      const list = this.cells.get(key(x, z)); if (!list) continue;
      for (const c of list) {
        if (this.seen.has(c)) continue; this.seen.add(c);
        const f = c.frame;
        if ((p.x - f.px) ** 2 + (p.y - f.py) ** 2 + (p.z - f.pz) ** 2 > (r + c.radius) ** 2) continue;
        this.matrix.multiplyMatrices(c.toLocal, world);
        for (let k = 0; k < (idx?.count ?? pos.count); k += 3) {
          tri.a.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(this.matrix);
          tri.b.fromBufferAttribute(pos, idx ? idx.getX(k + 1) : k + 1).applyMatrix4(this.matrix);
          tri.c.fromBufferAttribute(pos, idx ? idx.getX(k + 2) : k + 2).applyMatrix4(this.matrix);
          if (c.box.intersectsTriangle(tri)) return { path: c.path, s: c.s };
        }
      }
    }
    return null;
  }
}
