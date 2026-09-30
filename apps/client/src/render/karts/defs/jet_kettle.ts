// Jet Kettle (제트 케틀) — drift: a steampunk brass boiler on wheels. Riveted copper boiler drum with a spout and a
// kettle handle arching over it, pressure gauges, and twin smokestacks that puff (scale pulse) on boost.
// 1.8 × 1.2 × 0.75 m, spoked brass wheels r 0.27.
import { defineKart, sideProfile } from '../kit.ts';
import { lathe, cyl, torus, sph, cone } from '../../mascot/shapes.ts';

export default defineKart({
  id: 'jet_kettle',
  archetype: 'drift',
  dims: { length: 1.8, width: 1.2, height: 0.75, wheelR: 0.27 },
  livery: { primary: '#B87333', secondary: '#E0B04B', pattern: 8, number: 4 },
  seat: [0, 0.7, -0.22],
  build(k) {
    // chassis tray
    k.add(sideProfile(k, [[0.84, 0.24], [0.8, 0.36], [-0.8, 0.4], [-0.86, 0.26]], 0.86, 0.03), { color: 'dark', surf: 'metal' });
    // boiler drum lying along Z with a domed nose
    const drum = lathe(([[0.0, 0.5], [0.16, 0.45], [0.25, 0.34], [0.27, 0.16], [0.27, -0.16], [0.26, -0.19], [0.0, -0.2]] as Array<[number, number]>).reverse(), k.q(24, 12, 8));
    drum.rotateX(Math.PI / 2).translate(0, 0.46, 0.5);
    k.add(drum, { color: 'paint', surf: { rough: 0.3, metal: 0.75, glow: 0, coat: 0.6 } });
    // brass bands + rivets
    for (const z of [0.36, 0.52, 0.68]) {
      k.add(torus(z > 0.6 ? 0.25 : 0.275, 0.016, k.q(5, 3, 3), k.q(24, 12, 8)).translate(0, 0.46, z), { color: 'secondary', surf: 'gold' });
      if (k.lod === 0) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.add(sph(0.012, 5, 3).translate(Math.cos(a) * 0.278, 0.46 + Math.sin(a) * 0.278, z + 0.028), { color: 'secondary', surf: 'gold' }); }
    }
    // spout (forward-up) + lid knob + the kettle handle arching over the drum
    k.add(cone(0.045, 0.26, k.q(10, 6, 4)).rotateX(1.05).translate(0, 0.62, 0.96), { color: 'paint', surf: { rough: 0.3, metal: 0.75, glow: 0, coat: 0.6 } });
    k.add(k.tb([[0.24, 0.62, 0.62], [0.2, 0.86, 0.52], [0, 0.92, 0.5], [-0.2, 0.86, 0.52], [-0.24, 0.62, 0.62]], 0.026, true), { color: 'secondary', surf: 'gold' });
    if (k.lod < 2) k.add(sph(0.045, 10, 6).translate(0, 0.74, 0.62), { color: 'secondary', surf: 'gold' });
    // pressure gauges on the drum's back face (seen by the driver and from the flanks)
    for (const s of [1, -1]) {
      if (k.lod < 2) k.add(cyl(0.07, 0.07, 0.03, 14).rotateZ(Math.PI / 2).translate(s * 0.27, 0.46, 0.44), { color: 'secondary', surf: 'gold' });
      k.decal([s * 0.287, 0.46, 0.44], s > 0 ? 'x+' : 'x-', 0.12, 0.12, { color: '#2B2B2E', cell: 'gauge' });
    }
    // seat
    k.add(k.rb(0.52, 0.14, 0.42, 0.04).translate(0, 0.43, -0.22), { color: '#5A3A28', surf: 'matte' });
    k.add(k.rb(0.54, 0.16, 0.08, 0.04).rotateX(-0.2).translate(0, 0.55, -0.48), { color: '#5A3A28', surf: 'matte' });
    // twin smokestacks: flared crowns; they puff on boost
    for (const s of [1, -1]) {
      const name = `stack${s > 0 ? 'L' : 'R'}`;
      k.bone(name, 'chassis', [s * 0.36, 0.5, -0.66]);
      k.motion(name, { boost: ['y', 0.12] });
      k.add(cyl(0.065, 0.07, 0.6, k.q(14, 8, 5)).translate(s * 0.36, 0.8, -0.66), { color: 'paint', bone: name, surf: { rough: 0.3, metal: 0.75, glow: 0, coat: 0.6 } });
      k.add(lathe([[0.065, 0], [0.1, 0.06], [0.11, 0.1], [0.085, 0.1]], k.q(14, 8, 5)).translate(s * 0.36, 1.1, -0.66), { color: 'secondary', bone: name, surf: 'gold' });
      k.exhaust([s * 0.36, 1.2, -0.66], { style: 'none', r: 0.08 });
    }
    for (const s of [1, -1]) k.number([s * 0.431, 0.33, -0.2], s > 0 ? 'x+' : 'x-', 0.14, { color: 'secondary' });
    k.handlebar({ color: 'secondary', grip: '#5A3A28', style: 'tiller', dashZ: 0.3, dashY: 0.5 });
    const W = { r: 0.27, w: 0.18, style: 'brass' as const, rim: 'secondary' as const, hubCell: 'gauge' as const };
    k.wheel(0, [0.52, 0.27, 0.54], W);
    k.wheel(1, [-0.52, 0.27, 0.54], W);
    k.wheel(2, [0.53, 0.27, -0.56], { ...W, w: 0.22 });
    k.wheel(3, [-0.53, 0.27, -0.56], { ...W, w: 0.22 });
  },
});
