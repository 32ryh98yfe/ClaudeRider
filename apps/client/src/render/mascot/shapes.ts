// Primitive shapes for mascots and karts (build time only). Every builder returns a fresh geometry the caller owns.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sparkleShape } from '../util/geo.ts';

export type V3 = readonly [number, number, number];

export const rbox = (w: number, h: number, d: number, r = 0.1, seg = 3): THREE.BufferGeometry =>
  new RoundedBoxGeometry(w, h, d, Math.max(1, seg), Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 12, open = false): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sph = (r: number, ws = 12, hs = 8): THREE.BufferGeometry => new THREE.SphereGeometry(r, ws, hs);
/** Upper part of a sphere (dome), `frac` of the half-height from the top (1 = hemisphere). */
export const dome = (r: number, ws = 16, hs = 6, frac = 1): THREE.BufferGeometry => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, (Math.PI / 2) * frac);
export const cone = (r: number, h: number, seg = 10): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);
export const torus = (r: number, t: number, rs = 8, ts = 20, arc = Math.PI * 2): THREE.BufferGeometry => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const capsule = (r: number, len: number, cap = 4, rad = 10): THREE.BufferGeometry => new THREE.CapsuleGeometry(r, len, cap, rad);
export const ico = (r: number, d = 0): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, d);
export const octa = (r: number): THREE.BufferGeometry => new THREE.OctahedronGeometry(r, 0);

/** Lathe around +Y from [radius, y] profile points. */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, seg = 16, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg, phiStart, phiLength);
}

/** Tube along a Catmull-Rom curve through `pts`. */
export function tube(pts: ReadonlyArray<V3>, radius: number, tubular = 16, radial = 6, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Extrude a 2D outline (in the XY plane) along +Z by `depth`, centred on Z. */
export function extrude(outline: ReadonlyArray<readonly [number, number]>, depth: number, bevel = 0, bevelSeg = 1): THREE.BufferGeometry {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * The original parametric sparkle (ADR-011, never the Claude logo): 10 rays, radii 0.85–1.05, inner 0.3, ±7° seeded
 * jitter; outer radius `r`, depth 0.3·r (spec 0.03 at r 0.10). LOD 0 is bevelled, 1 is flat-sided, 2 is a thin card.
 */
export function sparkle(r = 0.1, lod: 0 | 1 | 2 = 0, seed = 7): THREE.BufferGeometry {
  // at > 70 m the sparkle is a couple of pixels: a flattened diamond keeps the glint for 8 triangles
  if (lod === 2) return new THREE.OctahedronGeometry(r * 0.8, 0).scale(1, 1.1, 0.3);
  const sh = sparkleShape(10, seed);
  const depth = 0.3;
  const g = new THREE.ExtrudeGeometry(sh, lod === 0
    ? { depth: depth - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 1, curveSegments: 1 }
    : { depth, bevelEnabled: false, curveSegments: 1 });
  g.center();
  g.scale(r, r, r);
  return g;
}

/** 5-point star plate in the XY plane (used for wizard hats, LED "stars", badges). */
export function star(r: number, inner = 0.45, depth = 0.02, points = 5): THREE.BufferGeometry {
  const out: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 === 0 ? r : r * inner;
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return extrude(out, depth, depth * 0.3, 1);
}

/**
 * A thin rounded strip from `a` to `b` (used for scarf tails, capes, ribbons): `segs` segments along the length so
 * blended skinning can bend it. Width is along `side` (unit vector), thickness along the cross product.
 */
export function strip(a: V3, b: V3, width: number, thick: number, segs: number, side: V3 = [1, 0, 0], taper = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(width, thick, 1, 1, 1, Math.max(1, segs));
  // box spans z -0.5..0.5 → map to a..b; taper the far end
  const P = g.attributes.position!;
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
  const sd = new THREE.Vector3(...side).normalize();
  const up = new THREE.Vector3().crossVectors(dir, sd).normalize();
  const sx = new THREE.Vector3().crossVectors(up, dir).normalize();
  for (let i = 0; i < P.count; i++) {
    const t = P.getZ(i) + 0.5;
    const w = 1 + (taper - 1) * t;
    const px = P.getX(i) * w, py = P.getY(i);
    const p = A.clone().addScaledVector(dir, t * len).addScaledVector(sx, px).addScaledVector(up, py);
    P.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Axis-aligned voxel mesh from a filled-cell predicate; only exposed faces are emitted (flat shading, toy-pixel look). */
export function voxels(nx: number, ny: number, nz: number, cell: number, filled: (x: number, y: number, z: number) => boolean,
  shade?: (x: number, y: number, z: number, face: number) => number): { geo: THREE.BufferGeometry; shades: Float32Array } {
  const pos: number[] = [], nor: number[] = [], sh: number[] = [], idx: number[] = [];
  const F = [
    { d: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { d: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { d: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { d: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ] as const;
  const ox = -nx * cell / 2, oy = -ny * cell / 2, oz = -nz * cell / 2;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    if (!filled(x, y, z)) continue;
    F.forEach((f, fi) => {
      const [dx, dy, dz] = f.d;
      const X = x + dx, Y = y + dy, Z = z + dz;
      const inside = X >= 0 && Y >= 0 && Z >= 0 && X < nx && Y < ny && Z < nz && filled(X, Y, Z);
      if (inside) return;
      const base = pos.length / 3;
      for (const c of f.c) { pos.push(ox + (x + c[0]) * cell, oy + (y + c[1]) * cell, oz + (z + c[2]) * cell); nor.push(dx, dy, dz); }
      const s = shade ? shade(x, y, z, fi) : 1;
      sh.push(s, s, s, s);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return { geo: g, shades: new Float32Array(sh) };
}

/**
 * A ribbon with thickness following a smooth curve through `pts` (scarf tails, capes, hat bands). Width lies along
 * `side` projected perpendicular to the curve; `taper` scales the width at the far end; `widthFn` can shape it.
 */
export function ribbon(pts: ReadonlyArray<V3>, width: number, thick: number, segs: number, side: V3 = [1, 0, 0], taper = 1, widthFn?: (t: number) => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  const S = new THREE.Vector3(side[0], side[1], side[2]).normalize();
  const pos: number[] = [], idx: number[] = [];
  const T = new THREE.Vector3(), X = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3();
  const ring = 6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    X.copy(S).addScaledVector(T, -S.dot(T)).normalize();
    N.crossVectors(T, X).normalize();
    const w = (width / 2) * (1 + (taper - 1) * t) * (widthFn ? widthFn(t) : 1), h = thick / 2;
    // flat oval cross-section (superellipse) so cloth edges catch the rim light
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const sx = Math.sign(cx) * Math.pow(Math.abs(cx), 0.35), sy = Math.sign(cy) * Math.pow(Math.abs(cy), 0.35);
      pos.push(P.x + X.x * sx * w + N.x * sy * h, P.y + X.y * sx * w + N.y * sy * h, P.z + X.z * sx * w + N.z * sy * h);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < ring; k++) {
    const a = i * ring + k, b = i * ring + ((k + 1) % ring), c = (i + 1) * ring + k, d = (i + 1) * ring + ((k + 1) % ring);
    idx.push(a, c, b, b, c, d);
  }
  const cap = (i: number, flip: boolean): void => {
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < ring; k++) { cx += pos[(i * ring + k) * 3]!; cy += pos[(i * ring + k) * 3 + 1]!; cz += pos[(i * ring + k) * 3 + 2]!; }
    pos.push(cx / ring, cy / ring, cz / ring);
    for (let k = 0; k < ring; k++) { const a = i * ring + k, b = i * ring + ((k + 1) % ring); if (flip) idx.push(base, a, b); else idx.push(base, b, a); }
  };
  cap(0, false); cap(segs, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Rounded-rectangle ring band (scarves, belts, crowns): outer w × d with corner radius r, `thick` wall, height h (along Y, centred). */
// Why custom: an extruded ring also builds the inner wall and dense caps, which are always hidden inside whatever the
// band wraps. This emits only the outer wall, a soft bevel and the top/bottom lips: 10 triangles per outline point.
export function band(w: number, d: number, r: number, h: number, thick: number, curveSeg = 5, bevel = 0.012): THREE.BufferGeometry {
  const hx = w / 2, hz = d / 2, R = Math.min(r, hx - 1e-3, hz - 1e-3);
  const arc = Math.max(1, curveSeg);
  const loop: Array<[number, number, number, number]> = []; // x, z, nx, nz
  const corners: Array<[number, number, number]> = [[hx - R, hz - R, 0], [-(hx - R), hz - R, Math.PI / 2], [-(hx - R), -(hz - R), Math.PI], [hx - R, -(hz - R), Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= arc; i++) { const a = a0 + (i / arc) * (Math.PI / 2); const nx = Math.cos(a), nz = Math.sin(a); loop.push([cx + nx * R, cz + nz * R, nx, nz]); }
  const b = Math.min(bevel, h / 3, thick);
  const prof: Array<[number, number]> = b > 0
    ? [[-thick, -h / 2], [-b, -h / 2], [0, -h / 2 + b], [0, h / 2 - b], [-b, h / 2], [-thick, h / 2]]
    : [[-thick, -h / 2], [0, -h / 2], [0, h / 2], [-thick, h / 2]];
  const pos: number[] = [], idx: number[] = [];
  const N = loop.length, M = prof.length;
  for (const [o, y] of prof) for (const [x, z, nx, nz] of loop) pos.push(x + nx * o, y, z + nz * o);
  for (let j = 0; j + 1 < M; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, c = j * N + ((i + 1) % N), e = (j + 1) * N + i, f = (j + 1) * N + ((i + 1) % N);
    idx.push(a, e, c, c, e, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
