// Tugboat (터그보트) — heavy balance: a chunky retro buggy on balloon tyres. Bull bar, open cage with a light bar,
// spare wheel on the tail and one big exhaust stack. 1.7 × 1.3 × 0.8 m, wheels r 0.32.
import { defineKart, sideProfile } from '../kit.ts';
import { cyl, lathe, torus, box } from '../../mascot/shapes.ts';

export default defineKart({
  id: 'tugboat',
  archetype: 'balance',
  dims: { length: 1.7, width: 1.3, height: 0.8, wheelR: 0.32 },
  livery: { primary: '#F2C14E', secondary: '#30302E', pattern: 5, number: 9 },
  seat: [0, 0.72, -0.1],
  build(k) {
    // tub body on a high skid plate
    k.add(k.rb(0.92, 0.1, 1.44, 0.04).translate(0, 0.3, 0), { color: 'trim', surf: 'plastic' });
    k.add(sideProfile(k, [[0.78, 0.36], [0.72, 0.66], [0.4, 0.7], [0.18, 0.62], [-0.36, 0.62], [-0.5, 0.74], [-0.78, 0.72], [-0.82, 0.36]], 0.96, 0.05), { color: 'paint' });
    // fenders over the balloon tyres
    for (const s of [1, -1]) for (const z of [0.55, -0.55]) k.add(k.rb(0.36, 0.08, 0.62, 0.04).translate(s * 0.6, 0.68, z), { color: 'secondary' });
    // safety stripes on the nose
    if (k.lod < 2) for (let i = 0; i < 4; i++) k.decal([-0.3 + i * 0.2, 0.52, 0.785], 'z+', 0.12, 0.26, { color: 'secondary', cell: 'white', rot: 0.5 });
    for (const s of [1, -1]) k.decal([s * 0.3, 0.6, 0.79], 'z+', 0.16, 0.16, { color: '#FFF3C4', cell: 'headlight', glow: 1.8 });
    // bull bar
    k.add(k.tb([[0.42, 0.36, 0.8], [0.44, 0.62, 0.9], [0.2, 0.66, 0.94], [-0.2, 0.66, 0.94], [-0.44, 0.62, 0.9], [-0.42, 0.36, 0.8]], 0.035), { color: 'chrome', surf: 'chrome' });
    if (k.lod < 2) for (const x of [0.16, -0.16]) k.add(k.tb([[x, 0.4, 0.84], [x, 0.66, 0.94]], 0.025), { color: 'chrome', surf: 'chrome' });
    // open cage: front hoop with a light bar + side rails back to the tail
    k.add(k.tb([[0.44, 0.66, 0.22], [0.42, 1.08, 0.12], [0.3, 1.16, 0.1], [-0.3, 1.16, 0.1], [-0.42, 1.08, 0.12], [-0.44, 0.66, 0.22]], 0.032, true), { color: 'dark', surf: 'metal' });
    for (const s of [1, -1]) k.add(k.tb([[s * 0.42, 1.08, 0.12], [s * 0.44, 0.98, -0.3], [s * 0.44, 0.74, -0.62]], 0.03), { color: 'dark', surf: 'metal' });
    k.add(k.rb(0.5, 0.08, 0.08, 0.03).translate(0, 1.21, 0.1), { color: 'dark', surf: 'metal' });
    for (const x of [-0.16, 0, 0.16]) k.decal([x, 1.21, 0.141], 'z+', 0.09, 0.09, { color: '#FFF3C4', cell: 'headlight', glow: 2.2 });
    // seat
    k.add(k.rb(0.52, 0.36, 0.1, 0.04).rotateX(-0.15).translate(0, 0.84, -0.42), { color: 'seat', surf: 'matte' });
    // spare wheel on the tail + big stack
    const spare = lathe([[0.12, -0.1], [0.24, -0.1], [0.26, 0], [0.24, 0.1], [0.12, 0.1]], k.q(16, 10, 6));
    spare.rotateX(Math.PI / 2).translate(0.16, 0.6, -0.92);
    k.add(spare, { color: 'rubber', surf: 'rubber' });
    if (k.lod < 2) k.add(cyl(0.13, 0.13, 0.18, k.q(14, 8, 5)).rotateX(Math.PI / 2).translate(0.16, 0.6, -0.92), { color: 'secondary' });
    k.add(cyl(0.07, 0.08, 0.62, k.q(14, 8, 5)).translate(-0.36, 0.95, -0.66), { color: 'chrome', surf: 'chrome' });
    if (k.lod < 2) k.add(torus(0.075, 0.018, 5, 14).rotateX(Math.PI / 2).translate(-0.36, 1.26, -0.66), { color: 'chrome', surf: 'chrome' });
    k.exhaust([-0.36, 1.26, -0.66], { r: 0.07, style: 'none' });
    k.number([0.481, 0.5, -0.12], 'x+', 0.22, { color: 'secondary' });
    k.number([-0.481, 0.5, -0.12], 'x-', 0.22, { color: 'secondary' });
    if (k.lod === 0) for (const s of [1, -1]) k.add(box(0.04, 0.04, 0.3).translate(s * 0.47, 0.42, 0.45), { color: 'chrome', surf: 'chrome' });
    k.handlebar({ color: 'dark', grip: 'red', dashZ: 0.5, dashY: 0.66 });
    const W = { r: 0.32, w: 0.3, style: 'balloon' as const, rim: 'secondary' as const };
    k.wheel(0, [0.6, 0.32, 0.55], W);
    k.wheel(1, [-0.6, 0.32, 0.55], W);
    k.wheel(2, [0.6, 0.32, -0.55], W);
    k.wheel(3, [-0.6, 0.32, -0.55], W);
  },
});
