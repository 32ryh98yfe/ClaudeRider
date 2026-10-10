// Procedural geometry helpers: coloured parts merged into one BufferGeometry (1 draw per model part group).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface ContactRange { start: number; count: number; role: 'solid' | 'cosmetic' | 'support' }
/** Semantic parts for the offline contact bake. These markers never change the rendered geometry. */
export function cosmetic(g: THREE.BufferGeometry): THREE.BufferGeometry { g.userData['contactRole'] = 'cosmetic'; return g; }
export function support(g: THREE.BufferGeometry): THREE.BufferGeometry { g.userData['contactRole'] = 'support'; return g; }

export function paint(g: THREE.BufferGeometry, c: THREE.ColorRepresentation, jitter = 0, seed = 1): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) {
    geo.userData = { ...g.userData };
    const ranges = g.userData['contactRanges'] as ContactRange[] | undefined;
    if (ranges?.length && g.index) {
      const expanded: ContactRange[] = [];
      for (let i = 0; i < g.index.count; i++) {
        const vertex = g.index.getX(i), role = ranges.find((r) => vertex >= r.start && vertex < r.start + r.count)?.role ?? 'solid';
        const last = expanded[expanded.length - 1];
        if (last?.role === role) last.count++; else expanded.push({ start: i, count: 1, role });
      }
      geo.userData['contactRanges'] = expanded;
    }
  }
  const col = new THREE.Color(c);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  let s = seed;
  for (let i = 0; i < n; i++) {
    let f = 1;
    if (jitter) { s = (s * 16807) % 2147483647; f = 1 - jitter + ((s / 2147483647) * 2 * jitter); }
    arr[i * 3] = col.r * f; arr[i * 3 + 1] = col.g * f; arr[i * 3 + 2] = col.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') geo.deleteAttribute(k);
  return geo;
}

export function place(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed (attribute mismatch)');
  const ranges: ContactRange[] = []; let offset = 0;
  for (const part of parts) {
    const count = part.getAttribute('position').count, role = part.userData['contactRole'] as ContactRange['role'] | undefined;
    const nested = part.userData['contactRanges'] as ContactRange[] | undefined;
    if (!role && nested?.length) for (const r of nested) ranges.push({ start: offset + r.start, count: r.count, role: r.role });
    else ranges.push({ start: offset, count, role: role ?? 'solid' });
    offset += count;
  }
  g.userData['contactRanges'] = ranges;
  g.computeBoundingSphere();
  return g;
}

export const rbox = (w: number, h: number, d: number, r = 0.1, seg = 3): THREE.BufferGeometry => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-3));
export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 12): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sph = (r: number, ws = 12, hs = 8): THREE.BufferGeometry => new THREE.SphereGeometry(r, ws, hs);
export const cone = (r: number, h: number, seg = 10): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);
export const ico = (r: number, d = 1): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, d);
export const torus = (r: number, t: number, rs = 8, ts = 20): THREE.BufferGeometry => new THREE.TorusGeometry(r, t, rs, ts);

/** Original parametric sparkle (NOT the Claude logo): seeded rays, radii 0.85–1.05, inner 0.3, ±7° jitter. */
export function sparkleShape(rays = 10, seed = 7): THREE.Shape {
  let s = seed;
  const rnd = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const sh = new THREE.Shape();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + (rnd() - 0.5) * (14 * Math.PI / 180);
    const r = 0.85 + rnd() * 0.2;
    const a0 = a - Math.PI / rays * 0.55, a1 = a + Math.PI / rays * 0.55;
    pts.push(new THREE.Vector2(Math.cos(a0) * 0.3, Math.sin(a0) * 0.3), new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r), new THREE.Vector2(Math.cos(a1) * 0.3, Math.sin(a1) * 0.3));
  }
  sh.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i]!.x, pts[i]!.y);
  sh.closePath();
  return sh;
}
export function sparkleGeometry(size = 0.2, depth = 0.05, seed = 7): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(sparkleShape(10, seed), { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: 0.05, bevelSegments: 2, curveSegments: 1 });
  g.center();
  g.scale(size, size, size);
  return g;
}
