// Low-poly "vinyl toy" shape helpers shared by the L6 theme kits (ember_mine, neon_harbor, orbital_nexus).
// Everything here is plain BufferGeometry work; materials always come from the MaterialLibrary.
import * as THREE from 'three/webgpu';
import { cone, cyl, ico, paint, place } from '../../util/geo.ts';

/** Seeded PRNG so a prop kind always builds the same mesh (props are instanced, one geometry per kind). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scales a painted geometry's vertex colours above 1. With the vertex-lit library material this makes small
 * "light" parts (windows, lamp heads, LED strips) read as self-lit at night until the library grows a
 * vertex-coloured emissive material (contract request L6-materials).
 */
export function glow(g: THREE.BufferGeometry, gain: number): THREE.BufferGeometry {
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.array.length; i++) (c.array as Float32Array)[i]! *= gain;
  c.needsUpdate = true;
  return g;
}

/** Faceted rock: an icosahedron whose vertices are pushed in/out by a hash of their position (no cracks). */
export function rock(r: number, seed: number, detail = 1, squash = 1): THREE.BufferGeometry {
  const g = ico(r, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 3.17) * 43758.5453;
    const k = 0.78 + (h - Math.floor(h)) * 0.4;
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Pointed crystal: hexagonal prism with a pyramid tip, base at y = 0. */
export function crystal(r: number, h: number): THREE.BufferGeometry[] {
  const tip = Math.min(h * 0.35, r * 2.2);
  return [place(cyl(r, r * 0.92, h - tip, 6), 0, (h - tip) / 2, 0), place(cone(r, tip, 6), 0, h - tip / 2, 0)];
}

/** A cluster of crystals leaning outward from the origin; returns painted parts in one colour. */
export function crystalCluster(colorHex: string, count: number, size: number, seed: number): THREE.BufferGeometry[] {
  const R = rng(seed);
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + R() * 0.8;
    const lean = i === 0 ? 0 : 0.25 + R() * 0.45;
    const h = size * (i === 0 ? 1 : 0.45 + R() * 0.45);
    const r = size * (i === 0 ? 0.18 : 0.08 + R() * 0.07);
    const d = i === 0 ? 0 : size * (0.12 + R() * 0.2);
    for (const part of crystal(r, h)) {
      out.push(paint(place(part, Math.cos(a) * d, -0.2, Math.sin(a) * d, Math.sin(a) * lean, R() * Math.PI, -Math.cos(a) * lean), colorHex));
    }
  }
  return out;
}

/** A straight beam between two points (box cross-section w × w). */
export function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number): THREE.BufferGeometry {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, w);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Flat irregular disc lying on y = 0 (lava pools, puddles, decals). */
export function blob(r: number, seed: number, seg = 14): THREE.BufferGeometry {
  const R = rng(seed);
  const sh = new THREE.Shape();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const rr = r * (0.7 + (i === seg ? 0 : R()) * 0.45);
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) sh.moveTo(x, y); else if (i === seg) sh.closePath(); else sh.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(sh, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}
