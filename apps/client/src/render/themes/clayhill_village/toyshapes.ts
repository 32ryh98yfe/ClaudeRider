// Small procedural shape helpers for the L5 world kits (clayhill_village, sunstone_desert, frostbyte_glacier).
// Everything is built once per prop kind at load and merged into one vertex-coloured geometry (1 draw per kind).
// Local prop frame (trackc placeProps): +X faces the road, +Y up, +Z runs along the track.
import * as THREE from 'three/webgpu';
import { paint, place } from '../../util/geo.ts';

/** Gable roof: triangle (base w on y = 0, apex at h) in the XY plane, extruded d along Z, centred on Z. */
export function prism(w: number, h: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -d / 2);
  return g;
}

/** Thin downward-pointing pennant (width w, drop h) in the XY plane. */
export function pennant(w: number, h: number, t = 0.04): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, -h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -t / 2);
  return g;
}

/** Tube along a smooth curve through the given points. */
export function tubeThrough(pts: ReadonlyArray<readonly [number, number, number]>, r: number, seg = 24, radial = 5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, seg, r, radial, false);
}

/** Lathe from a (radius, height) profile. */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, seg = 10): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** Torus arc in the XY plane from +X over +Y (arch spanning local X when arc = π). */
export function arcTube(r: number, tube: number, arc: number, radial = 6, tubular = 16): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, radial, tubular, arc);
}

/** Upper hemisphere (dome). */
export function dome(r: number, ws = 14, hs = 7): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
}

/** Deterministic PRNG so every prop kind is built identically on every client. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Paint + place shorthand: part(geometry, colour, x, y, z, rx, ry, rz, sx, sy, sz). */
export function part(g: THREE.BufferGeometry, c: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, jitter = 0, seed = 1): THREE.BufferGeometry {
  return paint(place(g, x, y, z, rx, ry, rz, sx, sy, sz), c, jitter, seed);
}

/** A row of pennants hanging from a sagging line between two anchor points (bunting). */
export function buntingLine(x0: number, x1: number, y: number, sag: number, z: number, colours: readonly string[], n: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([x0 + (x1 - x0) * t, y - sag * 4 * t * (1 - t), z]); }
  parts.push(paint(tubeThrough(pts, 0.035, 24, 4), '#6b5a4a'));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t, yy = y - sag * 4 * t * (1 - t);
    parts.push(part(pennant(0.55, 0.75), colours[i % colours.length]!, x, yy, z));
  }
  return parts;
}
