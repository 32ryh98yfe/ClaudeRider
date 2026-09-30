// Crown Cruiser (크라운 크루저) — speed: a royal chariot-car. Swept chariot guard in filigree livery, gold trim and
// crests, a tufted velvet throne seat, a crown hood ornament and two gold fanfare-trumpet exhausts.
// 1.9 × 1.25 × 0.7 m, gold spoked wheels r 0.28.
import { defineKart, sideProfile } from '../kit.ts';
import { lathe, cyl, sph, cone, torus } from '../../mascot/shapes.ts';

const VELVET = '#7A1F3D';

export default defineKart({
  id: 'crown_cruiser',
  archetype: 'speed',
  dims: { length: 1.9, width: 1.25, height: 0.7, wheelR: 0.28 },
  livery: { primary: '#7A2E4F', secondary: '#F2C14E', pattern: 7, number: 1 },
  seat: [0, 0.7, -0.16],
  build(k) {
    // chariot tub: low sweeping body rising into a curled front guard
    k.add(sideProfile(k, [[0.95, 0.3], [0.9, 0.46], [0.72, 0.56], [0.5, 0.52], [0.3, 0.46], [-0.4, 0.44], [-0.7, 0.5], [-0.92, 0.46], [-0.95, 0.26], [0.2, 0.2]], 0.9, 0.04), { color: 'paint' });
    // gold coachline and chrome-gold rails
    for (const s of [1, -1]) {
      k.add(k.tb([[s * 0.46, 0.46, 0.86], [s * 0.47, 0.5, 0.5], [s * 0.47, 0.46, -0.3], [s * 0.46, 0.48, -0.9]], 0.018, true), { color: 'secondary', surf: 'gold' });
      k.decal([s * 0.451, 0.34, -0.18], s > 0 ? 'x+' : 'x-', 0.26, 0.26, { color: 'secondary', cell: 'crest' });
      k.number([s * 0.452, 0.35, -0.18], s > 0 ? 'x+' : 'x-', 0.1, { color: 'primary' });
    }
    // crown hood ornament on the nose
    if (k.lod < 2) {
      k.add(cyl(0.07, 0.08, 0.06, 12).translate(0, 0.6, 0.72), { color: 'secondary', surf: 'gold' });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.add(cone(0.022, 0.08, 4).translate(Math.sin(a) * 0.065, 0.67, 0.72 + Math.cos(a) * 0.065), { color: 'secondary', surf: 'gold' }); }
      k.add(sph(0.03, 8, 6).translate(0, 0.64, 0.79), { color: '#B53333', surf: { rough: 0.1, metal: 0, glow: 0.25, coat: 1 } });
    }
    // throne: plush cushion, a low tufted back, and tall gold posts joined by an arch above the driver's head,
    // so from the chase camera the throne frames the character instead of hiding it
    k.add(k.rb(0.56, 0.14, 0.44, 0.05).translate(0, 0.44, -0.16), { color: VELVET as `#${string}`, surf: 'soft' });
    k.add(sideProfile(k, [[-0.34, 0.44], [-0.38, 0.64], [-0.44, 0.66], [-0.48, 0.44]], 0.62, 0.04), { color: VELVET as `#${string}`, surf: 'soft' });
    for (const s of [1, -1]) {
      k.add(k.tb([[s * 0.36, 0.44, -0.42], [s * 0.37, 1.02, -0.45], [s * 0.3, 1.18, -0.46]], 0.028, true), { color: 'secondary', surf: 'gold' });
      if (k.lod < 2) k.add(sph(0.045, 10, 6).translate(s * 0.37, 1.06, -0.45), { color: 'secondary', surf: 'gold' });
    }
    k.add(k.tb([[0.3, 1.18, -0.46], [0.14, 1.26, -0.46], [0, 1.28, -0.46], [-0.14, 1.26, -0.46], [-0.3, 1.18, -0.46]], 0.024, true), { color: 'secondary', surf: 'gold' });
    if (k.lod < 2) {
      if (k.lod === 0) for (const [x, y] of [[-0.15, 0.56], [0.15, 0.56], [0, 0.6]] as const) k.add(sph(0.02, 6, 4).translate(x, y, -0.35), { color: 'secondary', surf: 'gold' });
      k.add(sph(0.05, 10, 6).translate(0, 1.33, -0.46), { color: '#B53333', surf: { rough: 0.1, metal: 0, glow: 0.3, coat: 1 } });
    }
    // fanfare-trumpet exhausts
    for (const s of [1, -1]) {
      k.add(cyl(0.03, 0.03, 0.3, k.q(10, 6, 4)).rotateX(Math.PI / 2).translate(s * 0.2, 0.36, -0.94), { color: 'secondary', surf: 'gold' });
      k.add(lathe([[0.03, 0], [0.05, 0.08], [0.1, 0.14], [0.11, 0.15]], k.q(14, 8, 5)).rotateX(-Math.PI / 2).translate(s * 0.2, 0.36, -1.05), { color: 'secondary', surf: 'gold' });
      k.exhaust([s * 0.2, 0.36, -1.2], { style: 'none', r: 0.1 });
    }
    if (k.lod < 2) for (const s of [1, -1]) k.add(torus(0.07, 0.015, 4, 12).translate(s * 0.2, 0.36, -0.86), { color: 'secondary', surf: 'gold' });
    k.handlebar({ color: 'secondary', grip: VELVET as `#${string}`, dashZ: 0.4, dashY: 0.5 });
    const W = { r: 0.28, w: 0.2, style: 'gold' as const, rim: 'secondary' as const, hubCell: 'crown' as const };
    k.wheel(0, [0.56, 0.28, 0.58], W);
    k.wheel(1, [-0.56, 0.28, 0.58], W);
    k.wheel(2, [0.57, 0.28, -0.6], { ...W, w: 0.24 });
    k.wheel(3, [-0.57, 0.28, -0.6], { ...W, w: 0.24 });
  },
});
