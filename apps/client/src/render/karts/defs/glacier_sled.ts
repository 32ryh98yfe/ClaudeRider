// Glacier Sled (글레이셔 슬레드) — drift: a ski-front hover-kart. Twin chrome skis curling up at the nose, a low
// wraparound windscreen (glass overlay), two emissive cyan thrusters that flare on boost, small hub pods.
// 1.9 × 1.15 × 0.55 m, pods r 0.20. Default livery: aurora gradient with ice-crystal stickers.
import { defineKart, sideProfile, planPlate } from '../kit.ts';
import { cyl, torus } from '../../mascot/shapes.ts';
import * as THREE from 'three/webgpu';

export default defineKart({
  id: 'glacier_sled',
  archetype: 'drift',
  dims: { length: 1.9, width: 1.15, height: 0.55, wheelR: 0.2 },
  livery: { primary: '#BEE9F7', secondary: '#6A9BCC', pattern: 9, number: 5 },
  seat: [0, 0.68, -0.14],
  build(k) {
    // sled hull: a smooth wedge with a raised tail housing the thrusters
    k.add(sideProfile(k, [[0.86, 0.28], [0.7, 0.4], [0.3, 0.46], [0.1, 0.44], [-0.4, 0.46], [-0.6, 0.56], [-0.9, 0.52], [-0.94, 0.26], [0.2, 0.2]], 0.8, 0.04), { color: 'paint' });
    // side sponsons
    for (const s of [1, -1]) k.add(sideProfile(k, [[0.5, 0.22], [0.36, 0.36], [-0.7, 0.4], [-0.8, 0.24]], 0.16, 0.02).translate(s * 0.45, 0, 0), { color: 'secondary' });
    // twin skis with upturned tips, on struts
    for (const s of [1, -1]) {
      const x = s * 0.44;
      k.add(k.tb([[x, 0.07, -0.5], [x, 0.06, 0.2], [x, 0.07, 0.7], [x, 0.14, 0.92], [x, 0.24, 0.98]], 0.03, true), { color: 'chrome', surf: 'chrome' });
      if (k.lod < 2) k.add(planPlate(k, [[x - 0.05, 0.75], [x + 0.05, 0.75], [x + 0.05, -0.45], [x - 0.05, -0.45]], 0.035, 0.05), { color: 'chrome', surf: 'chrome' });
      for (const z of [0.55, -0.2]) k.add(k.tb([[x, 0.08, z], [x * 0.85, 0.26, z]], 0.018), { color: 'metal', surf: 'metal' });
    }
    // low wraparound windscreen (glass, stays below the driver's eyes)
    const ws = new THREE.CylinderGeometry(0.52, 0.52, 0.16, k.q(16, 8, 4), 1, true, -0.9, 1.8);
    ws.rotateX(0.35).translate(0, 0.54, -0.2);
    k.overlay(ws, { color: 'glass', cell: 'white', opacity: 0.35, glow: 0.15 });
    if (k.lod < 2) k.add(torus(0.52, 0.012, 4, k.q(24, 12, 6), 1.8).rotateX(Math.PI / 2).rotateY(Math.PI / 2 - 0.9 + Math.PI / 2).translate(0, 0.61, -0.18), { color: 'chrome', surf: 'chrome' });
    k.add(k.rb(0.48, 0.1, 0.4, 0.04).translate(0, 0.5, -0.14), { color: 'seat', surf: 'matte' });
    k.add(k.rb(0.5, 0.14, 0.1, 0.04).rotateX(-0.2).translate(0, 0.57, -0.42), { color: 'seat', surf: 'matte' });
    // thrusters (cyan glow cores flare on boost)
    for (const s of [1, -1]) {
      k.add(cyl(0.1, 0.12, 0.2, k.q(16, 10, 6)).rotateX(Math.PI / 2).translate(s * 0.22, 0.42, -0.9), { color: 'metal', surf: 'metal' });
      k.add(cyl(0.075, 0.075, 0.02, k.q(14, 8, 5)).rotateX(Math.PI / 2).translate(s * 0.22, 0.42, -1.0), { color: '#3EE6FF', surf: 'neon' });
      k.exhaust([s * 0.22, 0.42, -1.01], { r: 0.08, style: 'thruster', len: 0.02 });
    }
    for (const s of [1, -1]) {
      k.decal([s * 0.531, 0.31, -0.2], s > 0 ? 'x+' : 'x-', 0.2, 0.2, { color: 'ivory', cell: 'snow' });
      k.number([s * 0.531, 0.31, 0.1], s > 0 ? 'x+' : 'x-', 0.16, { color: 'ivory' });
    }
    k.number([0, 0.465, 0.45], 'y+', 0.16, { color: 'secondary' });
    k.handlebar({ color: 'chrome', dashZ: 0.36, dashY: 0.44 });
    // hub pods (small enclosed wheels) under the sponsons
    const P = { r: 0.2, w: 0.14, style: 'pod' as const, rim: 'secondary' as const, hubCell: 'snow' as const };
    k.wheel(0, [0.46, 0.2, 0.36], P);
    k.wheel(1, [-0.46, 0.2, 0.36], P);
    k.wheel(2, [0.47, 0.2, -0.62], P);
    k.wheel(3, [-0.47, 0.2, -0.62], P);
  },
});
