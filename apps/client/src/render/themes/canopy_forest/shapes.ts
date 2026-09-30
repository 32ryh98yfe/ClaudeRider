// Low-poly "vinyl toy" shape helpers for the L7 theme kits (canopy_forest, lantern_hollow).
// Everything is built once per scene into merged, vertex-coloured geometry (1 draw per prop kind).
import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, place } from '../../util/geo.ts';

/** Seeded PRNG: every client builds identical props, and rebuilding a scene never reshuffles them. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * "Lit from inside" colour: channels above 1 mark glowing parts (lantern paper, windows, pumpkin faces).
 * Today they only read as extra-bright albedo; the requested MaterialLibrary.vertexGlow (contract request
 * L7-prop-glow) turns max(c - 1, 0) into emissive so the same geometry blooms without new props.
 */
export function hdr(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** Faceted low-poly shading: face normals on a non-indexed copy. */
export function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('normal');
  out.computeVertexNormals();
  return out;
}

/** Organic lump (canopies, boulders, moss): welded icosahedron with seeded radial wobble, faceted. */
export function blob(r: number, detail: number, wobble: number, seed: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(r, detail);
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');
  const g = mergeVertices(base);
  const p = g.attributes.position as THREE.BufferAttribute;
  const rnd = prng(seed);
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rnd() * 2 - 1) * wobble;
    p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
  }
  return facet(g);
}

/** Surface of revolution from [radius, y] pairs (trunks, stems, pumpkins, vases). */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, seg = 8, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg, phiStart, phiLength);
}

/** Tube through points (roots, vines, rope, branches). */
export function tube(pts: ReadonlyArray<readonly [number, number, number]>, r: number, tubular = 8, radial = 5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, tubular, r, radial, false);
}

/** Spherical cap from the pole down to `thetaLen` (mushroom caps, domes, lily pads). */
export function dome(r: number, ws = 12, hs = 5, thetaLen = Math.PI / 2): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, thetaLen);
}

/** Inward-facing copy (flipped winding and normals) for shells seen from inside: log tunnels, crypt vaults. */
export function inward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  const p = out.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  out.deleteAttribute('normal');
  out.computeVertexNormals();
  return out;
}

/** n copies of a part built by `make(i, angle)` spread around the Y axis. */
export function around(n: number, make: (i: number, a: number) => THREE.BufferGeometry): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) out.push(make(i, (i / n) * Math.PI * 2));
  return out;
}

/** Paint + place in one call (the most common pattern in the prop builders). */
export function part(g: THREE.BufferGeometry, c: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, jitter = 0, seed = 1): THREE.BufferGeometry {
  return place(paint(g, c, jitter, seed), x, y, z, rx, ry, rz, sx, sy, sz);
}

/** Clawd-style eye slots (0.09 × 0.20 of a 1 m body, ADR-011) on a face of height `h`, facing +X. */
export function eyeSlots(h: number, x: number, y: number, gap: number, c: THREE.ColorRepresentation = '#141413'): THREE.BufferGeometry[] {
  const w = h * 0.09 / 0.2, hh = h;
  return [
    part(new THREE.BoxGeometry(0.04, hh, w), c, x, y, -gap / 2),
    part(new THREE.BoxGeometry(0.04, hh, w), c, x, y, gap / 2),
  ];
}
