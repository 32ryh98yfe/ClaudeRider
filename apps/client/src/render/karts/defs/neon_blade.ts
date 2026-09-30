// Neon Blade (네온 블레이드) — speed: an angular cyber hypercar. Faceted dark body with glowing circuit-trace livery,
// neon edge lines, twin swept fins, emissive rim wheels and an underglow decal (bloom, no point light).
// 2.0 × 1.2 × 0.5 m, wheels r 0.25.
import { defineKart, sideProfile, planPlate } from '../kit.ts';
import { cyl } from '../../mascot/shapes.ts';
import type { V3 } from '../kit.ts';

export default defineKart({
  id: 'neon_blade',
  archetype: 'speed',
  dims: { length: 2.0, width: 1.2, height: 0.5, wheelR: 0.25 },
  livery: { primary: '#1C1F26', secondary: '#FF3EA5', pattern: 6, number: 0 },
  seat: [0, 0.66, -0.12],
  build(k) {
    const glowPaint = { rough: 0.25, metal: 0.3, glow: 1.4, coat: 1 };
    // faceted wedge body (the livery pattern glows via surf.glow; the dark base stays dark)
    k.add(sideProfile(k, [[1.0, 0.18], [0.92, 0.28], [0.3, 0.42], [0.1, 0.44], [-0.4, 0.44], [-0.7, 0.5], [-0.98, 0.46], [-1.0, 0.2], [0.4, 0.14]], 0.62, 0.015), { color: 'paint', surf: glowPaint });
    for (const s of [1, -1]) k.add(sideProfile(k, [[0.8, 0.16], [0.6, 0.3], [-0.6, 0.36], [-0.9, 0.3], [-0.9, 0.14]], 0.2, 0.012).translate(s * 0.42, 0, 0), { color: 'paint', surf: glowPaint });
    // neon edge lines along the flanks
    for (const s of [1, -1]) {
      const pts: V3[] = [[s * 0.52, 0.3, 0.62], [s * 0.53, 0.35, -0.2], [s * 0.53, 0.37, -0.6], [s * 0.52, 0.32, -0.9]];
      k.add(k.tb(pts, 0.012, true), { color: 'secondary', surf: 'neon' });
      k.add(k.tb([[s * 0.2, 0.33, 0.95], [s * 0.3, 0.42, 0.3], [s * 0.3, 0.45, -0.3]], 0.01), { color: 'secondary', surf: 'neon' });
    }
    // twin swept fins
    for (const s of [1, -1]) k.add(sideProfile(k, [[-0.45, 0.46], [-0.8, 0.88], [-0.94, 0.9], [-0.9, 0.46]], 0.04, 0.01).rotateZ(s * 0.18).translate(s * 0.28, 0, 0), { color: 'paint', surf: glowPaint });
    // cockpit + seat
    k.add(k.rb(0.5, 0.05, 0.5, 0.02).translate(0, 0.44, -0.1), { color: 'dark', surf: 'plastic' });
    k.add(k.rb(0.46, 0.1, 0.4, 0.03).translate(0, 0.5, -0.12), { color: 'dark', surf: 'matte' });
    k.add(k.rb(0.46, 0.14, 0.1, 0.03).rotateX(-0.25).translate(0, 0.55, -0.4), { color: 'dark', surf: 'matte' });
    // splitter + diffuser
    k.add(planPlate(k, [[-0.56, 0.86], [0.56, 0.86], [0.46, 1.02], [-0.46, 1.02]], 0.08, 0.11), { color: 'dark', surf: 'plastic' });
    // underglow (emissive decal quad, blooms)
    k.decal([0, 0.035, 0], 'y+', 1.5, 2.3, { color: 'secondary', cell: 'glow', glow: 3.5, opacity: 0.9 });
    // headlight slits
    for (const s of [1, -1]) k.decal([s * 0.26, 0.3, 0.955], 'z+', 0.22, 0.06, { color: '#E8FBFF', cell: 'white', glow: 2.5 });
    k.number([0, 0.425, 0.42], 'y+', 0.16, { color: 'secondary', glow: 1.5 });
    for (const s of [1, -1]) k.number([s * 0.521, 0.26, -0.3], s > 0 ? 'x+' : 'x-', 0.14, { color: 'secondary', glow: 1.5 });
    k.handlebar({ color: 'secondary', grip: 'dark', style: 'yoke', dashZ: 0.3, dashY: 0.4 });
    for (const s of [1, -1]) {
      k.exhaust([s * 0.14, 0.32, -1.0], { r: 0.05, style: 'thruster', len: 0.08, color: 'metal' });
      if (k.lod < 2) k.add(cyl(0.056, 0.056, 0.012, 12).rotateX(Math.PI / 2).translate(s * 0.14, 0.32, -0.96), { color: 'secondary', surf: 'neon' });
    }
    const W = { r: 0.25, w: 0.22, style: 'neon' as const, rim: 'dark' as const };
    k.wheel(0, [0.56, 0.25, 0.62], W);
    k.wheel(1, [-0.56, 0.25, 0.62], W);
    k.wheel(2, [0.57, 0.25, -0.62], { ...W, w: 0.26 });
    k.wheel(3, [-0.57, 0.25, -0.62], { ...W, w: 0.26 });
  },
});
