// Orbital Nexus prop kit: a clean orbital token factory and the station city around it. White hull panels, cyan
// light, Claude-orange accent strips on deep navy. Local frame for PROPS rows: +Z along the track, +X toward the
// road, y = 0 on the ground. Glowing parts use the vertex-coloured emissive material (one material, many colours);
// structural parts are vertex-lit with small glow() accents. Holograms use the parametric sparkle, never a logo.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { box, cyl, merge, paint, place, rbox, sparkleGeometry, sph, torus } from '../../util/geo.ts';
import { beam, glow, rng } from '../ember_mine/shapes.ts';

const hull = (): THREE.Material => MaterialLibrary.vertexLit(0.45, 0.25);
const selfLit = (): THREE.Material => MaterialLibrary.emissiveVertex(1.2);

const WHITE = '#eef3f8', PANEL = '#c9d3de', NAVY = '#0b1026', NAVY_2 = '#152042', GREY = '#5b6475';
const CYAN = '#7de2fc', ORANGE = '#d97757', MINT = '#a6ffcb', AMBER = '#ffc36b';

/** Scatter pylon: slim white mast with orange light strips, a sensor dish and a beacon. */
function stationPylon(): THREE.BufferGeometry {
  const parts = [
    paint(place(cyl(0.9, 1.6, 34, 8), 0, 17, 0), PANEL, 0.04, 3),
    paint(place(cyl(2.4, 2.4, 1.2, 10), 0, 0.6, 0), GREY),
    paint(place(cyl(0.15, 0.15, 8, 5), 0, 38, 0), GREY),
    paint(place(cyl(3.2, 0.5, 1.2, 12), 0, 30, 0, 0.4, 0, 0), WHITE),
  ];
  for (let y = 6; y < 30; y += 6) parts.push(glow(paint(place(torus(1.25, 0.12, 4, 12), 0, y, 0, Math.PI / 2), ORANGE), 2.4));
  parts.push(glow(paint(place(sph(0.45, 8, 6), 0, 42.2, 0), '#ff4a3a'), 2.6));
  return merge(parts);
}

/** Hologram billboard facing the road (+X): cyan frame, mint scan lines, a floating sparkle. */
function holoPanel(): THREE.BufferGeometry {
  const parts = [paint(place(box(0.5, 5, 0.5), 0, 2.5, 0), NAVY_2), paint(place(box(0.3, 0.3, 11), 0, 5, 0), CYAN), paint(place(box(0.3, 0.3, 11), 0, 11, 0), CYAN)];
  for (const z of [-5.4, 5.4]) parts.push(paint(place(box(0.3, 6, 0.3), 0, 8, z), CYAN));
  for (let i = 0; i < 6; i++) parts.push(paint(place(new THREE.PlaneGeometry(10, 0.12), 0.1, 5.8 + i * 0.95, 0, 0, Math.PI / 2, 0), i % 2 ? MINT : '#3fa8c9'));
  parts.push(paint(place(sparkleGeometry(2.3, 0.12, 9), 0.4, 8, -1.8, 0, Math.PI / 2, 0), ORANGE));
  return merge(parts);
}

/** Server-rack block: three racks with LED columns and a coolant duct on top. */
function serverRack(): THREE.BufferGeometry {
  const R = rng(13), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 2.4;
    parts.push(paint(place(rbox(2.2, 5, 2.2, 0.12, 2), 0, 2.5, z), NAVY_2, 0.04, i));
    for (let k = 0; k < 9; k++) parts.push(glow(paint(place(box(0.06, 0.12, 1.4), 1.12, 0.8 + k * 0.45, z), R() < 0.25 ? ORANGE : R() < 0.5 ? MINT : CYAN), 2.2));
  }
  parts.push(paint(place(cyl(0.5, 0.5, 7.6, 8), 0, 5.4, 0, Math.PI / 2), PANEL));
  return merge(parts);
}

/** Stack of glowing token cubes (the foundry's product), orange with white edges. */
function tokenStack(): THREE.BufferGeometry {
  const R = rng(21), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const lv = i < 4 ? 0 : i < 6 ? 1 : 2, s = 1.3;
    const x = lv === 0 ? (i % 2) * 1.4 : lv === 1 ? 0.7 : 0.7, z = lv === 0 ? Math.floor(i / 2) * 1.4 : (i - 4) * 1.4 * (lv === 1 ? 1 : 0) + 0.7 * (lv === 2 ? 1 : 0);
    parts.push(paint(place(box(s, s, s), x, 0.65 + lv * 1.32, z, 0, R() * 0.4, 0), i % 3 ? ORANGE : AMBER));
  }
  return merge(parts);
}

/** Coolant pipe bundle running along the track (+Z), on saddles. */
function coolantPipe(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, r, c] of [[0, 1.2, 0.55, PANEL], [1.3, 1.0, 0.4, CYAN], [-1.1, 0.9, 0.35, WHITE]] as const) parts.push(paint(place(cyl(r, r, 12, 10), x, y, 0, Math.PI / 2), c));
  for (const z of [-4.5, 0, 4.5]) parts.push(paint(place(box(3.6, 0.9, 0.5), 0, 0.45, z), GREY));
  parts.push(glow(paint(place(box(0.08, 0.08, 11.6), 1.3, 1.42, 0), MINT), 2));
  return merge(parts);
}

/** Docking ring (helix centre on Orbital Express): a vertical station ring with orange nav lights. */
function dockingRing(): THREE.BufferGeometry {
  const parts = [paint(place(torus(26, 2.2, 8, 40), 0, 30, 0), PANEL, 0.03, 5), paint(place(torus(26, 0.6, 4, 40), 0, 30, 2.3), GREY)];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(glow(paint(place(box(1.2, 1.2, 1.2), Math.cos(a) * 26, 30 + Math.sin(a) * 26, 2.4), i % 3 ? ORANGE : CYAN), 2.4));
  }
  parts.push(paint(place(cyl(2.4, 3.2, 8, 8), 0, 4, 0), GREY));
  return merge(parts);
}

/** City tower for the finale: navy silhouette, orange accent bands, cyan window strips. */
function cityTower(): THREE.BufferGeometry {
  const R = rng(33), parts = [paint(place(box(12, 52, 12), 0, 25, 0), NAVY, 0.05, 2), paint(place(box(8, 10, 8), 0, 56, 0), NAVY_2)];
  for (let y = 4; y < 50; y += 3.6) {
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      if (R() < 0.3) continue;
      const nx = Math.sin(ry) * 6.05, nz = Math.cos(ry) * 6.05;
      parts.push(paint(place(new THREE.PlaneGeometry(9.5, 1.2), nx, y, nz, 0, ry, 0), R() < 0.2 ? AMBER : CYAN));
    }
  }
  for (const y of [18, 36, 50.5]) parts.push(paint(place(box(12.5, 0.5, 12.5), 0, y, 0), ORANGE));
  parts.push(paint(place(torus(4.5, 0.3, 4, 20), 0, 61.5, 0, Math.PI / 2), ORANGE));
  return merge(parts);
}

/** Light bollard lining the road edge (cyan cap, orange ring). */
function lightStrip(): THREE.BufferGeometry {
  return merge([paint(place(cyl(0.22, 0.28, 1.2, 6), 0, 0.6, 0), NAVY_2), paint(place(cyl(0.26, 0.26, 0.25, 6), 0, 1.3, 0), CYAN), paint(place(torus(0.3, 0.05, 3, 8), 0, 0.5, 0, Math.PI / 2), ORANGE)]);
}

/**
 * Token press (F5 press hazard), real size in the hazard frame (x across, y up, z along): the HAZ box is
 * 5 along × 7 across × 3 up, so the stamp block is 7 × 3 × 5 with an orange die face and warning chevrons.
 */
function press(): THREE.BufferGeometry {
  const parts = [paint(place(rbox(7, 3, 5, 0.2, 2), 0, 1.5, 0), PANEL, 0.03, 4), paint(place(box(7.1, 0.35, 5.1), 0, 0.18, 0), ORANGE)];
  for (let i = -3; i <= 3; i++) parts.push(paint(place(box(0.5, 1.2, 0.06), i * 0.9, 2.1, 2.53, 0, 0, 0.6), i % 2 ? NAVY : AMBER));
  parts.push(paint(place(cyl(0.6, 0.6, 5, 8), 0, 5.5, 0), GREY));
  return merge(parts);
}

/** Laser gate (F5 press hazard, effect=block; HAZ box 1.5 along × 6 across × 3 up): two posts, red beams across. */
function laserGate(): THREE.BufferGeometry {
  return merge([
    paint(place(box(0.5, 3.2, 0.5), -3.1, 1.6, 0), NAVY_2), paint(place(box(0.5, 3.2, 0.5), 3.1, 1.6, 0), NAVY_2),
    glow(paint(place(box(6, 0.14, 0.14), 0, 1.0, 0), '#ff3a4a'), 2.6), glow(paint(place(box(6, 0.14, 0.14), 0, 2.0, 0), '#ff3a4a'), 2.6),
    glow(paint(place(box(0.6, 0.4, 0.6), -3.1, 3.3, 0), ORANGE), 2), glow(paint(place(box(0.6, 0.4, 0.6), 3.1, 3.3, 0), ORANGE), 2),
  ]);
}

/** Maglev freight pod (F5 train hazard, HAZ box 24 along × 3.4 across × 4 up): 24 m long along +Z, white hull, cyan windows, orange stripe. */
function maglev(): THREE.BufferGeometry {
  const parts = [paint(place(rbox(3.2, 3.2, 24, 0.9, 2), 0, 2.0, 0), WHITE, 0.03, 6), paint(place(box(3.26, 0.3, 24.05), 0, 1.3, 0), ORANGE), paint(place(box(2.2, 0.5, 23), 0, 0.3, 0), GREY)];
  for (let z = -10; z <= 10; z += 2.5) for (const sx of [1, -1]) parts.push(glow(paint(place(box(0.05, 0.7, 1.8), sx * 1.62, 2.5, z), CYAN), 1.8));
  return merge(parts);
}

/** Deck support (compiler-placed under elevated decks): slim truss column with a glowing node. */
function truss(): THREE.BufferGeometry {
  const parts = [paint(place(cyl(0.5, 0.7, 6, 6), 0, 3, 0), PANEL, 0.04, 5), paint(place(box(3, 0.5, 1.6), 0, 5.85, 0), GREY)];
  for (let y = 0.6; y < 5.4; y += 1.6) parts.push(paint(beam(-0.6, y, 0, 0.6, y + 1.4, 0, 0.12), GREY), paint(beam(0.6, y, 0, -0.6, y + 1.4, 0, 0.12), GREY));
  parts.push(glow(paint(place(sph(0.35, 6, 4), 0, 5.2, 0.6), CYAN), 2));
  return merge(parts);
}

/** Station arch over the road (compiler-placed; spans ±9 m) with an orange holo band. */
function stationArch(): THREE.BufferGeometry {
  return merge([
    paint(place(rbox(1, 7.5, 1, 0.3, 2), -9, 3.75, 0), PANEL), paint(place(rbox(1, 7.5, 1, 0.3, 2), 9, 3.75, 0), PANEL),
    paint(place(rbox(19.5, 1.2, 1.2, 0.4, 2), 0, 7.4, 0), WHITE),
    glow(paint(place(box(14, 0.35, 1.25), 0, 6.7, 0), ORANGE), 2.2),
    glow(paint(place(box(3.4, 1.0, 0.2), 0, 8.4, 0.3), CYAN), 1.8),
  ]);
}

/** Crash cushion at a gore: stacked white/orange drums. */
function goreCushion(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) parts.push(paint(place(cyl(0.42, 0.42, 0.9, 10), (j - i / 2) * 0.85, 0.45, -i * 0.8), i % 2 ? WHITE : ORANGE));
  parts.push(glow(paint(place(box(1.6, 0.6, 0.1), 0, 1.3, 0.4), CYAN), 1.6));
  return merge(parts);
}

export const ORBITAL_PROPS: Record<string, PropFactory> = {
  station_pylon: { build: () => ({ geometry: stationPylon(), material: hull(), castShadow: true }), maxInstances: 256 },
  holo_panel: { build: () => ({ geometry: holoPanel(), material: selfLit() }) },
  server_rack: { build: () => ({ geometry: serverRack(), material: hull(), castShadow: true }) },
  token_stack: { build: () => ({ geometry: tokenStack(), material: selfLit() }) },
  coolant_pipe: { build: () => ({ geometry: coolantPipe(), material: hull() }) },
  docking_ring: { build: () => ({ geometry: dockingRing(), material: hull(), castShadow: false }) },
  city_tower: { build: () => ({ geometry: cityTower(), material: selfLit(), castShadow: false }), maxInstances: 256 },
  light_strip: { build: () => ({ geometry: lightStrip(), material: selfLit() }), maxInstances: 512 },
  hazard_press: { build: () => ({ geometry: press(), material: hull(), castShadow: true }) },
  hazard_laser: { build: () => ({ geometry: laserGate(), material: hull() }) },
  hazard_train: { build: () => ({ geometry: maglev(), material: hull(), castShadow: true }) },
  pillar: { build: () => ({ geometry: truss(), material: hull(), castShadow: true }) },
  gantry: { build: () => ({ geometry: stationArch(), material: hull(), castShadow: true }) },
  gore_cushion: { build: () => ({ geometry: goreCushion(), material: hull() }) },
};
