// Clay Comet (클레이 코멧) — balance: a bubbly "pebble car" capsule with a chrome canopy hoop, a sparkle tail fin and
// twin exhausts. 1.8 × 1.2 × 0.7 m, wheels r 0.25. Default livery: two-tone split with sparkle stickers.
import { defineKart, sideProfile, type KartKit } from '../kit.ts';
import { lathe, cyl, sph } from '../../mascot/shapes.ts';
import type * as THREE from 'three/webgpu';

/** Capsule hull: a lathe around Z, flattened; `r` is the half-width profile along the length. */
function hull(k: KartKit, sy: number, sx: number): THREE.BufferGeometry {
  // lathe profiles must run bottom → top for outward-facing triangles
  const g = lathe(([[0, 0.92], [0.2, 0.86], [0.34, 0.72], [0.44, 0.5], [0.5, 0.2], [0.52, -0.1], [0.5, -0.4], [0.44, -0.66], [0.3, -0.84], [0.0, -0.9]] as Array<[number, number]>).reverse(), k.q(28, 14, 8));
  g.rotateX(Math.PI / 2);
  g.scale(sx, sy, 1);
  return g;
}

export default defineKart({
  id: 'clay_comet',
  archetype: 'balance',
  dims: { length: 1.8, width: 1.2, height: 0.7, wheelR: 0.25 },
  livery: { primary: '#E8A87C', secondary: '#FAF9F5', pattern: 4, number: 3 },
  seat: [0, 0.67, -0.12],
  build(k) {
    // hull (paint, split two-tone) + belt line
    k.add(hull(k, 0.5, 1.02).translate(0, 0.38, 0), { color: 'paint' });
    if (k.lod < 2) k.add(k.tb([[0.535, 0.37, 0.4], [0.54, 0.37, -0.1], [0.51, 0.37, -0.5], [0.35, 0.37, -0.8]], 0.018), { color: 'chrome', surf: 'chrome' });
    if (k.lod < 2) k.add(k.tb([[-0.535, 0.37, 0.4], [-0.54, 0.37, -0.1], [-0.51, 0.37, -0.5], [-0.35, 0.37, -0.8]], 0.018), { color: 'chrome', surf: 'chrome' });
    // cockpit rim + seat
    k.add(k.rb(0.66, 0.06, 0.56, 0.03).translate(0, 0.625, -0.12), { color: 'trim', surf: 'plastic' });
    k.add(k.rb(0.56, 0.3, 0.1, 0.04).rotateX(-0.2).translate(0, 0.72, -0.42), { color: 'seat', surf: 'matte' });
    // canopy frame: one chrome hoop arching over the driver
    k.add(k.tb([[0.5, 0.5, 0.2], [0.46, 0.8, 0.12], [0.3, 1.0, 0.0], [0, 1.05, -0.06], [-0.3, 1.0, 0.0], [-0.46, 0.8, 0.12], [-0.5, 0.5, 0.2]], 0.026, true), { color: 'chrome', surf: 'chrome' });
    // sparkle tail fin
    k.add(sideProfile(k, [[-0.45, 0.6], [-0.72, 1.05], [-0.9, 1.08], [-0.86, 0.55]], 0.06, 0.015), { color: 'secondary' });
    k.decal([0.034, 0.86, -0.78], 'x+', 0.18, 0.18, { color: 'primary', cell: 'sparkle' });
    k.decal([-0.034, 0.86, -0.78], 'x-', 0.18, 0.18, { color: 'primary', cell: 'sparkle' });
    // nose: headlights + number roundels on the flanks
    for (const s of [1, -1]) {
      k.decal([s * 0.2, 0.43, 0.85], 'z+', 0.13, 0.13, { color: '#FFF6D8', cell: 'headlight', glow: 1.6 });
      k.decal([s * 0.536, 0.46, -0.05], s > 0 ? 'x+' : 'x-', 0.28, 0.28, { color: 'ivory', cell: 'roundel' });
      k.number([s * 0.539, 0.46, -0.05], s > 0 ? 'x+' : 'x-', 0.18, { color: 'primary' });
      k.decal([s * 0.49, 0.47, 0.42], s > 0 ? 'x+' : 'x-', 0.14, 0.14, { color: 'secondary', cell: 'star', rot: 0.3 });
    }
    if (k.lod < 2) k.add(sph(0.05, 10, 6).scale(1, 0.6, 1).translate(0, 0.64, 0.62), { color: 'secondary', surf: 'gloss' });
    k.handlebar({ color: 'chrome', dashZ: 0.42, dashY: 0.58 });
    for (const s of [1, -1]) {
      k.exhaust([s * 0.16, 0.36, -0.9], { r: 0.045, len: 0.14 });
      if (k.lod < 2) k.add(cyl(0.05, 0.05, 0.05, 10).rotateX(Math.PI / 2).translate(s * 0.16, 0.36, -0.86), { color: 'trim', surf: 'plastic' });
    }
    k.wheel(0, [0.55, 0.25, 0.56], { r: 0.25, w: 0.2, style: 'kart', rim: 'secondary' });
    k.wheel(1, [-0.55, 0.25, 0.56], { r: 0.25, w: 0.2, style: 'kart', rim: 'secondary' });
    k.wheel(2, [0.55, 0.25, -0.56], { r: 0.25, w: 0.22, style: 'kart', rim: 'secondary' });
    k.wheel(3, [-0.55, 0.25, -0.56], { r: 0.25, w: 0.22, style: 'kart', rim: 'secondary' });
  },
});
