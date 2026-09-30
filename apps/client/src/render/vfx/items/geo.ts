// Procedural proxy geometry for item VFX (vertex-coloured; lit parts use MaterialLibrary.vertexLit, glowing parts
// MaterialLibrary.emissiveVertex, so every item shares two materials). Original shapes only.
import * as THREE from 'three/webgpu';
import { merge, paint, place, rbox, box, cyl, cone, sph, torus, ico } from '../../util/geo.ts';

export interface ProxyParts { lit: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }

/** Missile capsule (+Z forward): ivory body, coloured nose, spark fins, glowing tail nozzle. */
export function missile(body: string, nose: string, fin: string): ProxyParts {
  return {
    lit: merge([
      paint(place(cyl(0.22, 0.22, 1.1, 12), 0, 0, 0, Math.PI / 2, 0, 0), body),
      paint(place(sph(0.22, 12, 8), 0, 0, 0.55, 0, 0, 0, 1, 1, 1.5), nose),
      paint(place(cyl(0.18, 0.24, 0.2, 12), 0, 0, -0.62, Math.PI / 2, 0, 0), '#3a3a40'),
    ]),
    glow: merge([
      paint(place(box(0.04, 0.34, 0.3), 0, 0.2, -0.35, 0.3, 0, 0), fin),
      paint(place(box(0.04, 0.34, 0.3), 0, -0.2, -0.35, -0.3, 0, 0), fin),
      paint(place(box(0.34, 0.04, 0.3), 0.2, 0, -0.35, 0, 0.3, 0), fin),
      paint(place(box(0.34, 0.04, 0.3), -0.2, 0, -0.35, 0, -0.3, 0), fin),
      paint(place(cyl(0.12, 0.12, 0.05, 10), 0, 0, -0.73, Math.PI / 2, 0, 0), '#ffe2a0'),
    ]),
  };
}

/** "#1" plate for the Top-1 missile: two bars and a numeral-like stroke, glowing gold. */
export function numberOnePlate(): THREE.BufferGeometry {
  return merge([
    paint(place(box(0.06, 0.34, 0.02), 0.05, 0, 0), '#fff3c4'),
    paint(place(box(0.12, 0.05, 0.02), -0.02, 0.14, 0, 0, 0, 0.5), '#fff3c4'),
    paint(place(box(0.16, 0.04, 0.02), 0.05, -0.16, 0), '#fff3c4'),
  ]);
}

/** Token bomb: round token with glyph ring and fuse spark. */
export function tokenBomb(): ProxyParts {
  return {
    lit: merge([paint(sph(0.55, 16, 12), '#2b2d33'), paint(place(torus(0.56, 0.06, 6, 24), 0, 0, 0, Math.PI / 2, 0, 0), '#D97757')]),
    glow: merge([paint(place(cyl(0.05, 0.05, 0.3, 6), 0, 0.65, 0), '#ffd23f'), paint(place(sph(0.09, 8, 6), 0, 0.84, 0), '#fff3c4')]),
  };
}

/** Cute bug: round body, head, antennae; wings are a separate flapping glow mesh. */
export function bug(): ProxyParts {
  return {
    lit: merge([
      paint(place(sph(0.35, 12, 8), 0, 0, -0.1, 0, 0, 0, 1, 0.8, 1.25), '#7BD88F'),
      paint(place(sph(0.22, 10, 8), 0, 0.05, 0.35), '#2b3a2e'),
      paint(place(sph(0.07, 6, 4), 0.1, 0.12, 0.52), '#ffffff'), paint(place(sph(0.07, 6, 4), -0.1, 0.12, 0.52), '#ffffff'),
      paint(place(cyl(0.015, 0.015, 0.35, 4), 0.1, 0.35, 0.45, 0.5, 0, -0.4), '#2b3a2e'), paint(place(cyl(0.015, 0.015, 0.35, 4), -0.1, 0.35, 0.45, 0.5, 0, 0.4), '#2b3a2e'),
    ]),
    glow: merge([paint(place(box(0.5, 0.02, 0.3), 0.32, 0.25, -0.05, 0, 0, 0.35), '#dff7ff'), paint(place(box(0.5, 0.02, 0.3), -0.32, 0.25, -0.05, 0, 0, -0.35), '#dff7ff')]),
  };
}

/** Hex drone with a glowing "429" panel (three bars) and rotor discs. */
export function drone(): ProxyParts {
  const panel: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) panel.push(paint(place(box(0.1, 0.16, 0.02), -0.14 + i * 0.14, 0, 0.36), '#ff4d4d'));
  return {
    lit: merge([
      paint(place(cyl(0.38, 0.38, 0.22, 6), 0, 0, 0), '#30302E'),
      paint(place(box(1.3, 0.05, 0.1), 0, 0.08, 0, 0, Math.PI / 4, 0), '#5a5a60'), paint(place(box(1.3, 0.05, 0.1), 0, 0.08, 0, 0, -Math.PI / 4, 0), '#5a5a60'),
    ]),
    glow: merge([...panel, ...[0, 1, 2, 3].map((k) => paint(place(cyl(0.2, 0.2, 0.01, 12), Math.cos(Math.PI / 4 + (k * Math.PI) / 2) * 0.46, 0.13, Math.sin(Math.PI / 4 + (k * Math.PI) / 2) * 0.46), '#9fd3ff'))]),
  };
}

/** Firewall segment: a stack of bricks (3 × 4), unit width 1.2 m, height 1.6 m; flame strips glow on top. */
export function firewall(width: number): ProxyParts {
  const bricks: THREE.BufferGeometry[] = [];
  const cols = Math.max(2, Math.round(width / 0.9));
  for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) {
    const x = -width / 2 + (c + (r % 2 ? 0.5 : 0.25)) * (width / cols);
    bricks.push(paint(place(rbox(width / cols - 0.06, 0.36, 0.5, 0.04, 1), x, 0.2 + r * 0.4, 0), r % 2 ? '#b5452f' : '#c9553a', 0.08, 3 + r * 7 + c));
  }
  const flames: THREE.BufferGeometry[] = [];
  for (let c = 0; c < cols; c++) flames.push(paint(place(cone(0.28, 0.9, 6), -width / 2 + (c + 0.5) * (width / cols), 2.05, 0), c % 2 ? '#ff8a3a' : '#ffd23f'));
  return { lit: merge(bricks), glow: merge(flames) };
}

/** Padlock (slot lock) glyph. */
export function padlock(): ProxyParts {
  return {
    lit: merge([paint(place(rbox(0.5, 0.42, 0.18, 0.06, 2), 0, 0, 0), '#E0B04B')]),
    glow: merge([paint(place(torus(0.16, 0.04, 6, 14, ), 0, 0.26, 0), '#fff3c4'), paint(place(box(0.08, 0.14, 0.2), 0, -0.02, 0), '#30302E')]),
  };
}

/** Mirrored double-arrow glyph (◀ ▶), glowing. */
export function mirrorArrows(): THREE.BufferGeometry {
  const tri = (x: number, dir: number): THREE.BufferGeometry => paint(place(cone(0.22, 0.34, 3), x, 0, 0, 0, 0, dir * Math.PI / 2, 1, 1, 0.25), '#B57CFF');
  return merge([tri(-0.28, 1), tri(0.28, -1), paint(place(box(0.05, 0.4, 0.05), 0, 0, 0), '#faf9f5')]);
}

/** Gold halo torus. */
export function halo(): THREE.BufferGeometry { return paint(place(torus(0.55, 0.06, 8, 32), 0, 0, 0, Math.PI / 2, 0, 0), '#FFD23F'); }

/** Floating token glyph (little coin) for bubbles and orbiters. */
export function token(): THREE.BufferGeometry { return merge([paint(place(cyl(0.12, 0.12, 0.03, 10), 0, 0, 0, Math.PI / 2, 0, 0), '#FFC857'), paint(place(box(0.1, 0.02, 0.035), 0, 0, 0), '#fff3c4')]); }

/** Star glyph for dizzy orbits. */
export function star(): THREE.BufferGeometry { return paint(ico(0.12, 0), '#FFD23F'); }

/** Tractor-beam cone (open, pointing down), unit height. */
export function beam(): THREE.BufferGeometry { const g = new THREE.ConeGeometry(0.9, 1, 16, 1, true); g.translate(0, -0.5, 0); return paint(g, '#ff5a5a'); }

/** Horizontal disc for ground decals (uv 0..1). */
export function disc(): THREE.BufferGeometry { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; }
