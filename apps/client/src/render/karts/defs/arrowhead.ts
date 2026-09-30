// Arrowhead (애로헤드) — speed: a low open-wheel wedge. Extruded side profile, front wing with endplates, a raised
// rear wing (the chase-camera silhouette), side-pod intakes. 2.0 × 1.2 × 0.45 m; wheels 0.24 front / 0.28 rear.
import { defineKart, sideProfile, planPlate } from '../kit.ts';
import { box, cyl } from '../../mascot/shapes.ts';

export default defineKart({
  id: 'arrowhead',
  archetype: 'speed',
  dims: { length: 2.0, width: 1.2, height: 0.45, wheelR: 0.26 },
  livery: { primary: '#E5484D', secondary: '#FAF9F5', pattern: 2, number: 1 },
  seat: [0, 0.68, -0.12],
  build(k) {
    // central wedge: needle nose → cockpit → engine cover → tail
    k.add(sideProfile(k, [[1.0, 0.16], [0.98, 0.22], [0.5, 0.33], [0.2, 0.4], [0.12, 0.45], [-0.3, 0.44], [-0.5, 0.52], [-0.82, 0.46], [-0.98, 0.34], [-0.98, 0.18], [0.3, 0.13]], 0.46, 0.03), { color: 'paint' });
    // side pods with intakes
    for (const s of [1, -1]) {
      k.add(sideProfile(k, [[0.28, 0.16], [0.2, 0.34], [-0.55, 0.36], [-0.7, 0.2], [-0.6, 0.14]], 0.24, 0.025).translate(s * 0.34, 0, 0), { color: 'paint' });
      k.decal([s * 0.34, 0.26, 0.245], 'z+', 0.2, 0.14, { color: 'dark', cell: 'vent' });
      k.number([s * 0.461, 0.26, -0.22], s > 0 ? 'x+' : 'x-', 0.14, { color: 'secondary' });
    }
    // cockpit surround + headrest
    k.add(k.rb(0.5, 0.05, 0.5, 0.02).translate(0, 0.45, -0.1), { color: 'trim', surf: 'plastic' });
    k.add(k.rb(0.46, 0.1, 0.4, 0.04).translate(0, 0.5, -0.12), { color: 'seat', surf: 'matte' });
    k.add(k.rb(0.4, 0.12, 0.1, 0.04).translate(0, 0.54, -0.38), { color: 'seat', surf: 'matte' });
    // front wing + endplates
    k.add(planPlate(k, [[-0.66, 0.9], [0.66, 0.9], [0.62, 1.04], [-0.62, 1.04]], 0.09, 0.13), { color: 'secondary' });
    for (const s of [1, -1]) k.add(k.rb(0.02, 0.14, 0.2, 0.008).translate(s * 0.66, 0.14, 0.96), { color: 'primary' });
    // low, wide twin-element rear wing: stays under the chase camera's view of the driver
    k.add(planPlate(k, [[-0.58, -0.86], [0.58, -0.86], [0.58, -1.06], [-0.58, -1.06]], 0.5, 0.54), { color: 'secondary' });
    if (k.lod < 2) k.add(planPlate(k, [[-0.58, -0.9], [0.58, -0.9], [0.58, -1.02], [-0.58, -1.02]], 0.44, 0.47), { color: 'primary' });
    for (const s of [1, -1]) {
      k.add(k.rb(0.02, 0.26, 0.26, 0.01).translate(s * 0.59, 0.44, -0.96), { color: 'primary' });
      if (k.lod < 2) k.add(box(0.03, 0.14, 0.05).translate(s * 0.2, 0.44, -0.94), { color: 'trim', surf: 'metal' });
      k.decal([s * 0.602, 0.46, -0.96], s > 0 ? 'x+' : 'x-', 0.18, 0.18, { color: 'secondary', cell: 'arrow', rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    k.number([0, 0.345, 0.55], 'y+', 0.16, { color: 'secondary' });
    k.handlebar({ color: 'chrome', style: 'yoke', dashZ: 0.3, dashY: 0.38 });
    for (const s of [1, -1]) k.exhaust([s * 0.1, 0.34, -0.99], { r: 0.04, len: 0.1 });
    if (k.lod === 0) k.add(cyl(0.02, 0.02, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0.2, -1.0), { color: '#E5484D', surf: 'glow' });
    // open wheels, fat rears
    k.wheel(0, [0.56, 0.24, 0.62], { r: 0.24, w: 0.2, style: 'slick', rim: 'secondary' });
    k.wheel(1, [-0.56, 0.24, 0.62], { r: 0.24, w: 0.2, style: 'slick', rim: 'secondary' });
    k.wheel(2, [0.57, 0.28, -0.6], { r: 0.28, w: 0.3, style: 'slick', rim: 'secondary' });
    k.wheel(3, [-0.57, 0.28, -0.6], { r: 0.28, w: 0.3, style: 'slick', rim: 'secondary' });
  },
});
