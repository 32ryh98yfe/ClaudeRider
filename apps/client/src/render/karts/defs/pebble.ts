// Pebble (페블) — balance starter: an open tube-frame go-kart. 1.6 × 1.1 × 0.5 m, wheels r 0.22, one exhaust.
// Silhouette: low flat tray, chunky side pods, a chrome roll hoop framing the driver, big nose number.
import { defineKart } from '../kit.ts';
import { box, cyl } from '../../mascot/shapes.ts';

export default defineKart({
  id: 'pebble',
  archetype: 'balance',
  dims: { length: 1.6, width: 1.1, height: 0.5, wheelR: 0.22 },
  livery: { primary: '#D97757', secondary: '#FAF9F5', pattern: 1, number: 7 },
  seat: [0, 0.56, -0.12],
  build(k) {
    const q = k.q;
    // floor tray + perimeter frame
    k.add(k.rb(0.86, 0.06, 1.36, 0.03).translate(0, 0.17, 0), { color: 'trim', surf: 'plastic' });
    k.add(k.tb([[0.4, 0.2, 0.62], [0.44, 0.2, 0.1], [0.44, 0.2, -0.5], [0.3, 0.2, -0.74], [-0.3, 0.2, -0.74], [-0.44, 0.2, -0.5], [-0.44, 0.2, 0.1], [-0.4, 0.2, 0.62]], 0.025), { color: 'metal', surf: 'chrome' });
    // side pods (painted, livery pattern) with a rounded sporty wedge
    for (const s of [1, -1]) {
      k.add(k.rb(0.2, 0.2, 0.5, 0.08).translate(s * 0.42, 0.29, -0.01), { color: 'paint' });
      if (k.lod < 2) k.add(k.rb(0.16, 0.06, 0.3, 0.03).translate(s * 0.42, 0.4, -0.01), { color: 'secondary' });
    }
    // nose fairing + number plate
    k.add(k.rb(0.72, 0.2, 0.4, 0.09, true).translate(0, 0.28, 0.6), { color: 'paint' });
    if (k.lod < 2) k.add(k.rb(0.46, 0.04, 0.22, 0.02).translate(0, 0.39, 0.6), { color: 'secondary' });
    k.number([0, 0.412, 0.6], 'y+', 0.2, { color: 'primary' });
    // bumpers
    k.add(k.tb([[0.48, 0.2, 0.62], [0.42, 0.22, 0.84], [0, 0.23, 0.9], [-0.42, 0.22, 0.84], [-0.48, 0.2, 0.62]], 0.035), { color: 'chrome', surf: 'chrome' });
    k.add(k.tb([[0.5, 0.22, -0.62], [0.42, 0.24, -0.82], [0, 0.25, -0.86], [-0.42, 0.24, -0.82], [-0.5, 0.22, -0.62]], 0.04), { color: 'chrome', surf: 'chrome' });
    // bucket seat
    k.add(k.rb(0.5, 0.08, 0.42, 0.035).translate(0, 0.31, -0.12), { color: 'seat', surf: 'matte' });
    k.add(k.rb(0.54, 0.36, 0.08, 0.035).rotateX(-0.22).translate(0, 0.48, -0.37), { color: 'seat', surf: 'matte' });
    // engine block behind the seat
    k.add(k.rb(0.42, 0.22, 0.26, 0.05).translate(0.04, 0.32, -0.62), { color: 'metal', surf: 'metal' });
    if (k.lod === 0) for (let i = 0; i < 4; i++) k.add(box(0.44, 0.02, 0.02).translate(0.04, 0.36 + i * 0.03, -0.49), { color: 'chrome', surf: 'chrome' });
    // roll hoop framing the driver (chrome) — lower than the head accessories so hats stay readable
    k.add(k.tb([[0.3, 0.22, -0.44], [0.29, 0.6, -0.47], [0.2, 0.72, -0.48], [-0.2, 0.72, -0.48], [-0.29, 0.6, -0.47], [-0.3, 0.22, -0.44]], 0.028, true), { color: 'chrome', surf: 'chrome' });
    k.handlebar({ color: 'chrome' });
    k.exhaust([-0.2, 0.36, -0.8], { r: 0.05, len: 0.2 });
    if (k.lod < 2) k.add(cyl(0.035, 0.035, 0.22, q(10, 6, 4)).rotateZ(Math.PI / 2).translate(-0.08, 0.36, -0.72), { color: 'chrome', surf: 'chrome' });
    // side sparkle stickers + side numbers
    for (const s of [1, -1]) {
      k.decal([s * 0.521, 0.29, 0.13], s > 0 ? 'x+' : 'x-', 0.14, 0.14, { color: 'secondary', cell: 'sparkle' });
      k.number([s * 0.521, 0.28, -0.08], s > 0 ? 'x+' : 'x-', 0.15, { color: 'secondary' });
    }
    k.wheel(0, [0.47, 0.22, 0.52], { r: 0.22, w: 0.19, style: 'kart', rim: 'secondary' });
    k.wheel(1, [-0.47, 0.22, 0.52], { r: 0.22, w: 0.19, style: 'kart', rim: 'secondary' });
    k.wheel(2, [0.49, 0.23, -0.5], { r: 0.23, w: 0.24, style: 'kart', rim: 'secondary' });
    k.wheel(3, [-0.49, 0.23, -0.5], { r: 0.23, w: 0.24, style: 'kart', rim: 'secondary' });
  },
});
