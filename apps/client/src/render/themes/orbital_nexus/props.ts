// Orbital Nexus prop kit: a clean orbital token factory and the station city around it. White hull panels, cyan
// guidance light, Claude-orange accent bands on deep navy. Local frame for PROPS rows: +Z along the track, +X toward
// the road, y = 0 on the ground. Bodies are lit and matte; only real lights glow (GlowParts gains, see
// ../neon_harbor/glowlit.ts): status strips and portholes stay under the bloom threshold, beacons and nav lights
// bloom. Holograms use the parametric sparkle, never a logo.
// Dressing pass (2026-10, 34-stylized-pass): antenna masts, solar arrays, habitat modules, cargo pods, fuel tanks,
// radiator fins and light bollards for the station; conveyors, robot arms, pipe racks, hazard lamps, silos and a
// foundry hall for Token Foundry; station versions of the shared racing furniture and a station start arch.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { box, cone, cyl, merge, paint, place, rbox, sparkleGeometry, sph, torus } from '../../util/geo.ts';
import { beam, glow, rng } from '../ember_mine/shapes.ts';
import { part, prism } from '../clayhill_village/toyshapes.ts';
import { GlowParts, glowLit } from '../neon_harbor/glowlit.ts';
import { litChevron } from '../neon_harbor/props.ts';

const hull = (): THREE.Material => MaterialLibrary.vertexLit(0.55, 0.15);
/** Matte hull bodies with glowing accents (one material for nearly every station prop). */
const station = (): THREE.Material => glowLit(0.7, 0.1);

const WHITE = '#eef3f8', PANEL = '#c9d3de', NAVY = '#0b1026', NAVY_2 = '#152042', GREY = '#5b6475', DARK = '#2a3142';
const CYAN = '#7de2fc', ORANGE = '#d97757', MINT = '#a6ffcb', AMBER = '#ffc36b', RED = '#ff4a3a', YEL = '#f2c230';

// ---- station dressing -----------------------------------------------------------------------------------------

/** Scatter pylon: slim white mast with orange light rings, a sensor dish and a beacon. */
function stationPylon(): THREE.BufferGeometry {
  const G = new GlowParts().add(
    part(cyl(0.9, 1.6, 34, 8), PANEL, 0, 17, 0, 0, 0, 0, 1, 1, 1, 0.04, 3), part(cyl(2.4, 2.4, 1.2, 10), GREY, 0, 0.6, 0),
    part(cyl(0.15, 0.15, 8, 5), GREY, 0, 38, 0), part(cyl(3.2, 0.5, 1.2, 12), WHITE, 0, 30, 0, 0.4, 0, 0),
  );
  for (let y = 6; y < 30; y += 6) G.light(1.6, paint(place(torus(1.25, 0.12, 4, 12), 0, y, 0, Math.PI / 2), ORANGE));
  G.light(2.6, part(sph(0.45, 8, 6), RED, 0, 42.2, 0));
  return G.build();
}

/** Paraboloid dish shell (axis +Y, opening up, vertex at the origin): back surface, rim, then the inner bowl. */
function dishGeometry(R: number, depth: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [], n = 6, t = 0.07;
  for (let i = 0; i <= n; i++) { const r = (i / n) * R; pts.push(new THREE.Vector2(r, (depth * r * r) / (R * R) - t)); }
  for (let i = n; i >= 0; i--) { const r = (i / n) * R; pts.push(new THREE.Vector2(r, (depth * r * r) / (R * R))); }
  return new THREE.LatheGeometry(pts, 18);
}

/** A dish tilted about Z by `rz` at (x, y, z): bowl, a strut to the feed horn at the focus, and a bracket to `mount`. */
function addDish(G: GlowParts, R: number, depth: number, x: number, y: number, z: number, rz: number, c: string, mount: readonly [number, number, number]): void {
  G.add(part(dishGeometry(R, depth), c, x, y, z, 0, 0, rz));
  const ax = -Math.sin(rz), ay = Math.cos(rz), f = (R * R) / (4 * depth);
  G.add(paint(beam(x, y, z, x + ax * f, y + ay * f, z, 0.04), GREY), part(cyl(0.08, 0.13, 0.3, 8), GREY, x + ax * f, y + ay * f, z, 0, 0, rz));
  G.add(paint(beam(mount[0], mount[1], mount[2], x - ax * 0.1, y - ay * 0.1, z, 0.13), GREY), part(box(0.45, 0.5, 0.45), GREY, mount[0], mount[1], mount[2]));
}

/** Lattice antenna mast (≈ 17 m) with two dishes, cyan nav lights and a red tip beacon. */
function antennaMast(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(rbox(2.2, 0.8, 2.2, 0.15, 2), GREY, 0, 0.4, 0));
  const H = 16, r = 0.55;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    G.add(part(cyl(0.07, 0.09, H, 5), WHITE, Math.cos(a) * r, 0.8 + H / 2, Math.sin(a) * r));
  }
  for (let y = 1.5; y < H; y += 1.6) for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2, a1 = ((k + 1) / 3) * Math.PI * 2;
    G.add(paint(beam(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y + 1.4, Math.sin(a1) * r, 0.05), PANEL));
  }
  // two dishes facing up and out, each a concave bowl with a feed horn and a bracket clamped to the mast (squashed
  // spheres read as floating rocks)
  addDish(G, 1.3, 0.42, 1.9, 11.6, 0, -0.9, WHITE, [0, 11.2, 0]);
  addDish(G, 0.9, 0.3, -1.6, 7.4, 0.5, 0.9, PANEL, [0, 7.1, 0.2]);
  G.add(part(cyl(0.05, 0.05, 2.4, 4), GREY, 0, H + 2, 0));
  for (const y of [5, 10, 14.5]) G.light(1.4, part(box(0.22, 0.22, 0.22), CYAN, r + 0.05, y, 0));
  G.light(2.6, part(sph(0.22, 8, 6), RED, 0, H + 3.3, 0));
  return G.build();
}

/** Two solar arrays on a truss: navy cells with a cyan grid, white frames, tilted toward the sky. */
function solarArray(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const z of [-3.2, 3.2]) {
    G.add(part(cyl(0.18, 0.24, 3.0, 6), GREY, -2.5, 1.5, z), part(box(0.5, 0.3, 0.5), DARK, -2.5, 3.0, z));
    G.add(part(box(5.4, 0.1, 5.6), WHITE, -2.5, 3.3, z, 0, 0, 0.45));
    G.add(part(box(5.1, 0.12, 5.3), '#1b2a5a', -2.5, 3.33, z, 0, 0, 0.45));
    for (let i = -2; i <= 2; i++) G.light(0.35, part(box(0.04, 0.14, 5.2), '#3f7fc4', -2.5 + i * 1.0 * Math.cos(0.45), 3.36 + i * 1.0 * Math.sin(0.45), z, 0, 0, 0.45));
  }
  G.add(part(box(0.3, 0.3, 12.4), PANEL, -2.5, 2.4, 0));
  G.light(1.2, part(box(0.2, 0.2, 0.2), MINT, -1.0, 2.6, 0));
  return G.build();
}

/** Habitat block: two hull cylinders with orange bands and lit portholes, a glass dome and a docking tube. */
function habitat(): THREE.BufferGeometry {
  const G = new GlowParts(), R = rng(71);
  for (const [x, y, len] of [[-4.5, 3.2, 13], [-11.5, 3.2, 10]] as const) {
    G.add(part(cyl(2.9, 2.9, len, 16), WHITE, x, y, 0, Math.PI / 2, 0, 0, 1, 1, 1, 0.02, 5));
    for (const zz of [-len / 2, len / 2]) G.add(part(cyl(2.4, 2.9, 0.8, 16), PANEL, x, y, zz + (zz < 0 ? -0.4 : 0.4), Math.PI / 2));
    for (const zz of [-len / 2 + 2, len / 2 - 2]) G.add(part(cyl(2.95, 2.95, 0.5, 16), ORANGE, x, y, zz, Math.PI / 2));
    for (let i = 0; i < Math.floor(len / 1.6) - 1; i++) {
      const zz = -len / 2 + 1.6 + i * 1.6;
      if (Math.abs(zz) > len / 2 - 2.6) continue;
      G.light(R() < 0.75 ? 0.8 : 0.4, part(cyl(0.32, 0.32, 0.08, 10), R() < 0.7 ? '#ffe2a8' : CYAN, x + 2.85, y + 0.6, zz, 0, 0, Math.PI / 2));
    }
    for (const zz of [-len / 2 + 1.5, len / 2 - 1.5]) G.add(part(box(0.6, y - 0.3, 0.6), GREY, x, (y - 0.3) / 2, zz));
  }
  G.add(part(cyl(1.0, 1.0, 3.2, 10), PANEL, -8, 3.2, 0, 0, 0, Math.PI / 2));
  G.add(part(cyl(2.6, 2.6, 0.6, 16), GREY, -11.5, 6.3, 0), part(sph(2.2, 16, 8), '#2b4a7a', -11.5, 6.5, 0, 0, 0, 0, 1, 0.7, 1));
  G.light(0.45, part(sph(2.0, 16, 8), '#5fb8e8', -11.5, 6.55, 0, 0, 0, 0, 1, 0.66, 1));
  G.light(2.2, part(sph(0.25, 8, 6), RED, -4.5, 6.4, -5));
  return G.build();
}

/** Cargo pods (space ground cover): rounded white/orange/grey pods with mint status strips. */
function cargoPods(): THREE.BufferGeometry {
  const G = new GlowParts(), R = rng(81);
  const cols = [WHITE, ORANGE, PANEL, WHITE, GREY] as const;
  for (let i = 0; i < 4; i++) {
    const lv = i < 3 ? 0 : 1, z = lv === 0 ? -1.4 + i * 1.4 : -0.7, x = -1.0;
    const c = cols[Math.floor(R() * cols.length)]!;
    G.add(part(rbox(1.3, 1.3, 1.3, 0.18, 2), c, x, 0.65 + lv * 1.32, z));
    G.add(part(box(1.34, 0.12, 1.34), c === ORANGE ? WHITE : ORANGE, x, 0.4 + lv * 1.32, z));
    G.light(0.9, part(box(0.03, 0.08, 0.7), MINT, x + 0.67, 0.95 + lv * 1.32, z));
  }
  G.add(part(box(1.6, 0.12, 4.6), DARK, -1.0, 0.03, -0.0));
  return G.build();
}

/** Fuel tanks: three spheres on legs with a pipe, hazard bands and a warning lamp. */
function fuelTanks(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const z of [-3, 0, 3]) {
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) G.add(part(cyl(0.1, 0.12, 2.4, 5), GREY, -2.2 + dx, 1.2, z + dz));
    G.add(part(sph(1.35, 14, 10), WHITE, -2.2, 3.4, z), part(cyl(1.37, 1.37, 0.3, 14), ORANGE, -2.2, 3.4, z));
  }
  G.add(part(cyl(0.18, 0.18, 7.4, 6), PANEL, -0.6, 1.0, 0, Math.PI / 2));
  for (let i = 0; i < 6; i++) G.add(part(box(0.5, 0.4, 0.5), i % 2 ? NAVY : YEL, -0.6, 0.2 + (i % 2) * 0.0, -3.5 + i * 1.4));
  G.add(part(cyl(0.08, 0.08, 4.2, 5), GREY, -0.4, 2.1, 3.9));
  G.light(2.0, part(sph(0.2, 8, 6), AMBER, -0.4, 4.3, 3.9));
  return G.build();
}

/** Radiator fins: four tall white heat panels with orange edge bands (along Z). */
function radiators(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(box(1.6, 0.6, 9), GREY, -1.2, 0.3, 0));
  for (let i = 0; i < 4; i++) {
    const z = -3.3 + i * 2.2;
    G.add(part(box(2.6, 6.4, 0.12), WHITE, -1.2, 3.8, z), part(box(2.62, 0.25, 0.14), ORANGE, -1.2, 6.9, z));
    for (let k = 0; k < 5; k++) G.add(part(box(2.4, 0.06, 0.14), PANEL, -1.2, 1.4 + k * 1.1, z));
  }
  G.light(1.3, part(box(0.1, 0.1, 8.6), CYAN, -0.38, 0.62, 0));
  return G.build();
}

/** Light bollard lining the road edge: navy post, cyan cap above the barrier, orange ring. */
function lightStrip(): THREE.BufferGeometry {
  return new GlowParts()
    .add(part(cyl(0.2, 0.26, 1.25, 8), NAVY_2, 0, 0.62, 0))
    .light(1.0, part(cyl(0.24, 0.24, 0.22, 8), CYAN, 0, 1.36, 0))
    .light(1.2, paint(place(torus(0.27, 0.05, 3, 8), 0, 0.5, 0, Math.PI / 2), ORANGE))
    .build();
}

/** Hologram billboard facing the road (+X): navy post, cyan frame, mint scan lines and an orange sparkle. */
function holoPanel(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(box(0.5, 5, 0.5), NAVY_2, -0.2, 2.5, 0));
  G.light(1.4, part(box(0.3, 0.3, 11), CYAN, -0.2, 5, 0), part(box(0.3, 0.3, 11), CYAN, -0.2, 11, 0));
  for (const z of [-5.4, 5.4]) G.light(1.4, part(box(0.3, 6, 0.3), CYAN, -0.2, 8, z));
  G.add(part(box(0.1, 5.7, 10.5), NAVY, -0.25, 8, 0));
  for (let i = 0; i < 6; i++) G.light(0.55, paint(place(new THREE.PlaneGeometry(10, 0.12), -0.18, 5.8 + i * 0.95, 0, 0, Math.PI / 2, 0), i % 2 ? MINT : '#3fa8c9'));
  G.light(1.3, paint(place(sparkleGeometry(2.3, 0.12, 9), -0.1, 8, -1.8, 0, Math.PI / 2, 0), ORANGE));
  return G.build();
}

/** City tower for the finale: navy body, cyan window strips, orange bands and a crown ring. */
function cityTower(): THREE.BufferGeometry {
  const R = rng(33), G = new GlowParts().add(part(box(12, 52, 12), '#1c2440', 0, 25, 0, 0, 0, 0, 1, 1, 1, 0.04, 2), part(box(8, 10, 8), NAVY_2, 0, 56, 0));
  for (let y = 4; y < 50; y += 3.6) {
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      if (R() < 0.3) continue;
      const nx = Math.sin(ry) * 6.05, nz = Math.cos(ry) * 6.05;
      G.light(0.55, paint(place(new THREE.PlaneGeometry(9.5, 1.1), nx, y, nz, 0, ry, 0), R() < 0.2 ? AMBER : CYAN));
    }
  }
  for (const y of [18, 36, 50.5]) G.light(1.3, part(box(12.5, 0.5, 12.5), ORANGE, 0, y, 0));
  G.light(1.6, paint(place(torus(4.5, 0.3, 4, 20), 0, 61.5, 0, Math.PI / 2), ORANGE));
  G.light(2.6, part(sph(0.5, 8, 6), RED, 0, 63, 0));
  return G.build();
}

/** Server-rack block: three racks with LED columns and a coolant duct on top. */
function serverRack(): THREE.BufferGeometry {
  const R = rng(13), G = new GlowParts();
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 2.4;
    G.add(part(rbox(2.2, 5, 2.2, 0.12, 2), NAVY_2, 0, 2.5, z, 0, 0, 0, 1, 1, 1, 0.04, i));
    for (let k = 0; k < 9; k++) G.light(1.0, part(box(0.06, 0.12, 1.4), R() < 0.25 ? ORANGE : R() < 0.5 ? MINT : CYAN, 1.12, 0.8 + k * 0.45, z));
  }
  G.add(part(cyl(0.5, 0.5, 7.6, 8), PANEL, 0, 5.4, 0, Math.PI / 2));
  return G.build();
}

/** Stack of glowing token cubes (the foundry's product), orange with amber cores. */
function tokenStack(): THREE.BufferGeometry {
  const R = rng(21), G = new GlowParts();
  for (let i = 0; i < 7; i++) {
    const lv = i < 4 ? 0 : i < 6 ? 1 : 2, s = 1.3;
    const x = lv === 0 ? (i % 2) * 1.4 : 0.7, z = lv === 0 ? Math.floor(i / 2) * 1.4 : lv === 1 ? (i - 4) * 1.4 : 0.7;
    G.add(part(box(s, s, s), WHITE, x - 1.5, 0.65 + lv * 1.32, z - 0.7, 0, R() * 0.4, 0));
    G.light(1.1, part(box(s * 0.7, s * 1.02, s * 0.7), i % 3 ? ORANGE : AMBER, x - 1.5, 0.65 + lv * 1.32, z - 0.7, 0, R() * 0.4, 0));
  }
  return G.build();
}

/** Coolant pipe bundle running along the track (+Z), on saddles. */
function coolantPipe(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const [x, y, r, c] of [[-1.3, 1.2, 0.55, PANEL], [0, 1.0, 0.4, CYAN], [-2.4, 0.9, 0.35, WHITE]] as const) G.add(part(cyl(r, r, 12, 10), c, x, y, 0, Math.PI / 2));
  for (const z of [-4.5, 0, 4.5]) G.add(part(box(3.6, 0.9, 0.5), GREY, -1.2, 0.45, z));
  G.light(1.0, part(box(0.08, 0.08, 11.6), MINT, 0, 1.42, 0));
  return G.build();
}

// ---- foundry dressing -----------------------------------------------------------------------------------------

/** Raised conveyor: legs, a dark belt with rollers, side rails, token cubes riding it, hazard-striped ends. */
function conveyorRig(): THREE.BufferGeometry {
  const G = new GlowParts(), L = 12;
  for (const z of [-5, 0, 5]) for (const x of [-0.3, -2.1]) G.add(part(box(0.2, 1.1, 0.2), GREY, x, 0.55, z));
  G.add(part(box(2.2, 0.25, L), '#2b2f38', -1.2, 1.2, 0));
  for (let z = -L / 2 + 0.4; z < L / 2; z += 0.8) G.add(part(cyl(0.1, 0.1, 2.1, 6), '#8d939c', -1.2, 1.2, z, 0, 0, Math.PI / 2));
  for (const x of [-0.08, -2.32]) G.add(part(box(0.12, 0.35, L), YEL, x, 1.45, 0));
  for (let i = 0; i < 5; i++) G.light(1.1, part(box(0.8, 0.8, 0.8), i % 2 ? AMBER : ORANGE, -1.2, 1.75, -L / 2 + 1.5 + i * 2.2, 0, i * 0.3, 0));
  for (const z of [-L / 2, L / 2]) for (let k = 0; k < 4; k++) G.add(part(box(2.3, 0.14, 0.14), k % 2 ? NAVY : YEL, -1.2, 0.3 + k * 0.28, z));
  return G.build();
}

/** Robot arm on a turret: base, two orange arm segments, a gripper holding a token, a status lamp. */
function robotArm(): THREE.BufferGeometry {
  const G = new GlowParts();
  G.add(part(cyl(1.0, 1.2, 0.8, 12), GREY, -1.5, 0.4, 0), part(cyl(0.7, 0.8, 0.9, 12), ORANGE, -1.5, 1.25, 0));
  G.add(paint(beam(-1.5, 1.6, 0, -1.1, 4.4, 0.6, 0.45), ORANGE), part(sph(0.4, 10, 8), GREY, -1.1, 4.4, 0.6));
  G.add(paint(beam(-1.1, 4.4, 0.6, 0.4, 3.4, 1.2, 0.35), WHITE), part(box(0.5, 0.3, 0.5), GREY, 0.45, 3.15, 1.25));
  for (const dz of [-0.18, 0.18]) G.add(part(box(0.08, 0.45, 0.08), DARK, 0.45, 2.8, 1.25 + dz));
  G.light(1.2, part(box(0.42, 0.42, 0.42), ORANGE, 0.45, 2.55, 1.25));
  G.light(1.8, part(sph(0.14, 8, 6), MINT, -1.5, 1.85, 0.75));
  return G.build();
}

/** Pipe rack along Z: portal legs, three pipes (white, cyan, orange) and a lit walkway edge. */
function pipeRack(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const z of [-5.5, 0, 5.5]) {
    G.add(part(box(0.3, 5, 0.3), GREY, -0.4, 2.5, z), part(box(0.3, 5, 0.3), GREY, -3.4, 2.5, z), part(box(3.4, 0.3, 0.4), GREY, -1.9, 5.0, z));
  }
  for (const [x, r, c] of [[-0.9, 0.35, WHITE], [-1.9, 0.28, CYAN], [-2.8, 0.4, ORANGE]] as const) G.add(part(cyl(r, r, 12, 10), c, x, 5.5 + r, 0, Math.PI / 2));
  G.light(1.0, part(box(0.06, 0.06, 11.6), AMBER, -0.22, 4.86, 0));
  return G.build();
}

/** Hazard lamp: striped post with an amber beacon (bloom) and a small sign box (factory warning lights). */
function hazardLamp(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (let k = 0; k < 8; k++) G.add(part(cyl(0.11, 0.11, 0.4, 8), k % 2 ? NAVY : YEL, 0, 0.2 + k * 0.4, 0));
  G.add(part(cyl(0.2, 0.25, 0.2, 10), GREY, 0, 3.3, 0), part(cyl(0.18, 0.2, 0.08, 10), GREY, 0, 3.86, 0));
  G.light(2.2, part(cyl(0.16, 0.16, 0.36, 10), AMBER, 0, 3.6, 0));
  G.add(part(box(0.08, 0.6, 0.6), DARK, 0.14, 2.4, 0));
  for (const s of [1, -1]) G.light(1.0, part(box(0.02, 0.4, 0.07), YEL, 0.19, 2.4, s * 0.12, s * 0.6, 0, 0));
  return G.build();
}

/** Silo cluster: three vertical tanks with orange bands, a catwalk ring and roof vents. */
function silos(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const [x, z, h] of [[-3, -3.2, 12], [-3, 3.2, 10], [-8.5, 0, 14]] as const) {
    G.add(part(cyl(2.6, 2.6, h, 16), WHITE, x, h / 2, z, 0, 0, 0, 1, 1, 1, 0.02, 9), part(cone(2.7, 1.4, 16), PANEL, x, h + 0.7, z));
    for (const y of [h * 0.3, h * 0.7]) G.add(part(cyl(2.64, 2.64, 0.5, 16), ORANGE, x, y, z));
    G.add(part(cyl(2.9, 2.9, 0.12, 16), GREY, x, h * 0.85, z));
    G.light(0.9, part(box(0.05, 0.6, 0.6), MINT, x + 2.62, 1.6, z));
  }
  G.light(2.4, part(sph(0.22, 8, 6), RED, -8.5, 15.6, 0));
  return G.build();
}

/** Foundry hall: a long hall with a sawtooth roof, lit loading doors, stacks with beacons and orange stripes. */
function foundryHall(): THREE.BufferGeometry {
  const G = new GlowParts();
  const W = 32, D = 20, H = 10;
  G.add(part(box(D, H, W), '#d9dde2', -D / 2, H / 2, 0, 0, 0, 0, 1, 1, 1, 0.02, 4));
  G.add(part(box(0.15, 1.2, W + 0.05), ORANGE, 0.05, H - 1.4, 0), part(box(0.15, 0.6, W + 0.05), NAVY_2, 0.05, 0.3, 0));
  for (const z of [-9, 0, 9]) {
    G.add(part(box(0.2, 6, 6.2), DARK, 0.12, 3.0, z));
    G.light(0.65, part(box(0.06, 4.6, 5.4), '#ffd89a', 0.22, 2.4, z));
    for (let k = 0; k < 5; k++) G.add(part(box(0.3, 0.3, 0.3), k % 2 ? NAVY : YEL, 0.2, 0.2 + k * 0.3, z - 3.4), part(box(0.3, 0.3, 0.3), k % 2 ? NAVY : YEL, 0.2, 0.2 + k * 0.3, z + 3.4));
    G.light(2.0, part(box(0.08, 0.16, 0.5), '#fff1c8', 0.3, 6.4, z));
  }
  for (let i = 0; i < 5; i++) {
    const x = -2 - i * 4;
    G.add(part(prism(4, 2.6, W), PANEL, x - 2, H, 0, 0, 0, 0, 1, 1, 1));
    G.light(0.5, part(box(0.06, 2.0, W - 1), '#9fd8f0', x - 0.05, H + 1.1, 0, 0, 0, 0.55));
  }
  // gable ends (seen from along the road): orange band, clerestory windows, a vent grille and a downpipe
  for (const sz of [-1, 1]) {
    const z = sz * (W / 2 + 0.06);
    G.add(part(box(D, 1.2, 0.12), ORANGE, -D / 2, H - 1.4, z), part(box(D, 0.6, 0.12), NAVY_2, -D / 2, 0.3, z));
    for (let i = 0; i < 4; i++) G.light(0.55, part(box(3.2, 1.6, 0.08), '#ffd89a', -2.6 - i * 4.6, H - 3.6, z + sz * 0.04));
    G.add(part(box(5, 3, 0.1), DARK, -D / 2, 3.2, z + sz * 0.02));
    for (let k = 0; k < 6; k++) G.add(part(box(4.6, 0.16, 0.14), GREY, -D / 2, 2.0 + k * 0.48, z + sz * 0.05));
    G.add(part(cyl(0.18, 0.18, H, 6), GREY, -0.8, H / 2, z + sz * 0.2));
  }
  for (const z of [-11, 11]) {
    G.add(part(cyl(0.9, 1.1, 9, 10), GREY, -16, H + 4.5, z), part(cyl(0.95, 0.95, 0.6, 10), ORANGE, -16, H + 8.5, z));
    G.light(2.4, part(sph(0.3, 8, 6), RED, -16, H + 9.4, z));
  }
  G.light(1.4, paint(place(sparkleGeometry(1.6, 0.1, 9), 0.25, H - 3.4, 0, 0, Math.PI / 2, 0), ORANGE));
  return G.build();
}

// ---- racing furniture (station versions of the shared kinds) ------------------------------------------------------

/** Holo sponsor board above the barrier: a lit navy face with our sparkle, bars or chevrons (original art). */
function holoBoard(v: 'a' | 'b' | 'c'): THREE.BufferGeometry {
  // edge rows stand on the ground 0.35–1.2 m below the deck behind a 1.1 m barrier: the 1.8 m posts keep the panel clear of it
  const W = 3.0, H = 0.95, y = 1.8 + H / 2, G = new GlowParts();
  G.add(part(box(0.09, y, 0.09), GREY, -0.05, y / 2, -W / 2 + 0.25), part(box(0.09, y, 0.09), GREY, -0.05, y / 2, W / 2 - 0.25));
  G.add(part(box(0.12, H + 0.12, W + 0.12), WHITE, -0.07, y, 0));
  G.light(0.45, part(box(0.04, H, W), v === 'a' ? '#14306a' : v === 'b' ? NAVY_2 : '#2a2350', 0.0, y, 0));
  if (v === 'a') {
    G.light(1.2, paint(place(sparkleGeometry(0.34, 0.03, 11), 0.04, y, -0.85, 0, Math.PI / 2, 0), ORANGE));
    G.light(0.95, part(box(0.03, 0.14, 1.6), WHITE, 0.04, y + 0.12, 0.45), part(box(0.03, 0.09, 1.2), CYAN, 0.04, y - 0.16, 0.25));
  } else if (v === 'b') {
    // chevrons point along +Z (the travel direction once placed): on a bend's outside they point into the turn
    for (let k = 0; k < 4; k++) {
      const z = -0.9 + k * 0.6;
      G.light(1.0, part(box(0.03, 0.5, 0.14), CYAN, 0.04, y + 0.14, z, -0.8, 0, 0), part(box(0.03, 0.5, 0.14), CYAN, 0.04, y - 0.14, z, 0.8, 0, 0));
    }
  } else {
    for (let k = 0; k < 15; k++) G.light(k % 2 ? 0.95 : 0.4, part(box(0.03, 0.2, 0.2), k % 2 ? ORANGE : NAVY_2, 0.04, y - H / 2 + 0.1, -W / 2 + 0.1 + k * 0.2));
    G.light(1.2, paint(place(sparkleGeometry(0.28, 0.03, 5), 0.04, y + 0.12, 0, 0, Math.PI / 2, 0), MINT));
  }
  return G.build();
}

/**
 * Corner chevron board (ad_board_b): a 1.5× panel on posts tall enough to clear the 1.5 m impact pads in front of it,
 * with four chevrons pointing along +Z (the travel direction once placed on side=R). Station: coral on white;
 * foundry: yellow on black.
 */
export function chevronBoard(fg: string, field: string, frame: string): THREE.BufferGeometry {
  const W = 4.5, H = 1.42, y = 2.3 + H / 2, G = new GlowParts();
  G.add(part(box(0.1, y, 0.1), GREY, -0.06, y / 2, -W / 2 + 0.35), part(box(0.1, y, 0.1), GREY, -0.06, y / 2, W / 2 - 0.35));
  G.add(part(box(0.12, H + 0.14, W + 0.14), frame, -0.07, y, 0));
  G.light(0.25, part(box(0.04, H, W), field, 0.0, y, 0));
  for (let k = 0; k < 4; k++) {
    const z = -1.35 + k * 0.9;
    G.light(1.05, part(box(0.03, 0.75, 0.2), fg, 0.04, y + 0.21, z, -0.8, 0, 0), part(box(0.03, 0.75, 0.2), fg, 0.04, y - 0.21, z, 0.8, 0, 0));
  }
  return G.build();
}

/** Impact barrier at corners (station tyre wall): padded white/orange blocks in a 1.3 m run, three high so the
 *  checker reads over the 1.1 m barrier (trackc stands the row on the ground 0.35–0.7 m below the deck). */
function impactPads(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 2; c++) for (let h = 0; h < 3; h++) p.push(part(rbox(0.62, 0.48, 0.6, 0.12, 2), (c + h) % 2 ? WHITE : ORANGE, 0, 0.25 + h * 0.5, -0.32 + c * 0.64));
  p.push(part(box(0.66, 0.06, 1.3), NAVY_2, 0, 1.5, 0));
  return merge(p);
}

/** Holo banner mast (start straight): white mast, orange banner with our sparkle, a cyan tip light. */
function bannerMast(): THREE.BufferGeometry {
  return new GlowParts()
    .add(part(cyl(0.07, 0.09, 6.4, 6), WHITE, 0, 3.2, 0), part(box(0.04, 2.4, 0.9), ORANGE, 0, 4.2, 0.5), part(box(0.045, 0.28, 0.9), WHITE, 0, 3.1, 0.5))
    .add(paint(place(sparkleGeometry(0.22, 0.03, 9), 0.03, 4.6, 0.5, 0, Math.PI / 2, 0), WHITE))
    .light(1.8, part(sph(0.12, 8, 6), CYAN, 0, 6.5, 0))
    .build();
}

/** Station start arch (local X across the road, ±9 m; scaled by road width / 16): white arch, checker band, orange holo band, start lamps. */
function stationArch(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const x of [-9, 9]) {
    G.add(part(rbox(1.1, 7.6, 1.1, 0.3, 2), PANEL, x, 3.8, 0), part(rbox(1.6, 0.6, 1.6, 0.15, 2), GREY, x, 0.3, 0));
    G.light(1.8, part(box(0.12, 6.4, 0.12), CYAN, x + (x < 0 ? 0.56 : -0.56), 4.0, -0.56));
  }
  G.add(part(rbox(19.6, 1.6, 1.3, 0.4, 2), WHITE, 0, 7.6, 0));
  for (const z of [-0.66, 0.66]) {
    for (let i = 0; i < 44; i++) G.add(part(box(0.4, 0.3, 0.04), i % 2 ? NAVY : WHITE, -8.6 + i * 0.4, 8.2, z));
    G.light(1.6, part(box(14, 0.3, 0.05), ORANGE, 0, 7.25, z * 1.02));
    G.light(1.6, paint(place(sparkleGeometry(0.6, 0.06, 7), 0, 7.7, z * 1.08, 0, z > 0 ? 0 : Math.PI, 0), CYAN));
  }
  for (let i = 0; i < 5; i++) {
    const x = -2.4 + i * 1.2;
    G.add(part(rbox(0.9, 0.6, 0.5, 0.08, 1), NAVY, x, 6.45, -0.75));
    for (const dx of [-0.2, 0.2]) G.light(1.4, part(cyl(0.15, 0.15, 0.06, 10), RED, x + dx, 6.45, -1.02, Math.PI / 2, 0, 0));
  }
  return G.build();
}

// ---- hazards and compiler props -------------------------------------------------------------------------------

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

/** Docking ring (helix centre on Orbital Express): a vertical station ring with orange nav lights. */
function dockingRing(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(torus(26, 2.2, 8, 40), PANEL, 0, 30, 0, 0, 0, 0, 1, 1, 1, 0.03, 5), part(torus(26, 0.6, 4, 40), GREY, 0, 30, 2.3));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    G.light(1.8, part(box(1.2, 1.2, 1.2), i % 3 ? ORANGE : CYAN, Math.cos(a) * 26, 30 + Math.sin(a) * 26, 2.4));
  }
  G.add(part(cyl(2.4, 3.2, 8, 8), GREY, 0, 4, 0));
  return G.build();
}

/** Launch / zero-g tube rib (PROP on the road centre; local X across): a vertical hull ring around the road with
 *  cyan nav nodes and an orange band. Its lower half sinks into the deck plinth; the top clears the road by 11 m. */
function launchRing(): THREE.BufferGeometry {
  const G = new GlowParts().add(paint(place(torus(9.6, 0.5, 8, 56), 0, 1.5, 0), PANEL), paint(place(torus(9.6, 0.58, 8, 56), 0, 1.5, 0, 0, 0, 0, 1, 1, 0.32), ORANGE));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (Math.sin(a) < -0.2) continue; // the nodes below the deck would never be seen
    G.light(1.8, part(box(0.5, 0.5, 1.2), i % 2 ? CYAN : WHITE, Math.cos(a) * 9.6, 1.5 + Math.sin(a) * 9.6, 0));
  }
  return G.build();
}

/** Deck support (compiler-placed under elevated decks): slim truss column with a glowing node. */
function truss(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(cyl(0.5, 0.7, 6, 6), PANEL, 0, 3, 0, 0, 0, 0, 1, 1, 1, 0.04, 5), part(box(3, 0.5, 1.6), GREY, 0, 5.85, 0));
  for (let y = 0.6; y < 5.4; y += 1.6) G.add(paint(beam(-0.6, y, 0, 0.6, y + 1.4, 0, 0.12), GREY), paint(beam(0.6, y, 0, -0.6, y + 1.4, 0, 0.12), GREY));
  G.light(1.4, part(sph(0.35, 6, 4), CYAN, 0, 5.2, 0.6));
  return G.build();
}

/** Crash cushion at a gore: stacked white/orange drums. */
function goreCushion(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) G.add(part(cyl(0.42, 0.42, 0.9, 10), i % 2 ? WHITE : ORANGE, (j - i / 2) * 0.85, 0.45, -i * 0.8));
  G.light(1.2, part(box(1.6, 0.6, 0.1), CYAN, 0, 1.3, 0.4));
  return G.build();
}

const F = (geometry: () => THREE.BufferGeometry, material: () => THREE.Material, castShadow = true, maxInstances?: number): PropFactory =>
  ({ build: () => ({ geometry: geometry(), material: material(), castShadow }), ...(maxInstances ? { maxInstances } : {}) });

/** Token Foundry overrides: yellow-on-black corner chevrons, 1.5×. */
export const FOUNDRY_PROPS: Record<string, PropFactory> = {
  ad_board_b: F(() => chevronBoard(YEL, '#14161b', DARK), station, true, 80),
  chevron: F(() => litChevron(YEL, 1.0, { panel: '#14161b', scale: 1.5 }), station, true, 256),
};

export const ORBITAL_PROPS: Record<string, PropFactory> = {
  // station dressing
  station_pylon: F(stationPylon, station, true, 512),
  antenna_mast: F(antennaMast, station, true, 512),
  solar_array: F(solarArray, station, true, 512),
  habitat_house: F(habitat, station, true, 256),
  cargo_crate: F(cargoPods, station, true, 800),
  fuel_tank: F(fuelTanks, station, true, 256),
  radiator_fin: F(radiators, station, true, 256),
  light_strip: F(lightStrip, station, false, 1500),
  holo_panel: F(holoPanel, station, true, 256),
  city_tower: F(cityTower, station, false, 512),
  server_rack: F(serverRack, station, true, 512),
  token_stack: F(tokenStack, station, true, 256),
  coolant_pipe: F(coolantPipe, station, true, 512),
  docking_ring: F(dockingRing, station, false, 8),
  launch_ring: F(launchRing, station, false, 32),
  // foundry dressing (the bush/crate/lamp-free names never thin: they are structures, not plants)
  conveyor_rig: F(conveyorRig, station, true, 256),
  robot_arm: F(robotArm, station, true, 256),
  pipe_rack: F(pipeRack, station, true, 256),
  hazard_lamp: F(hazardLamp, station, true, 512),
  silo_tank: F(silos, station, true, 128),
  foundry_building: F(foundryHall, station, true, 64),
  // racing furniture
  ad_board_a: F(() => holoBoard('a'), station, true, 80),
  // T1 chevrons: coral on a white panel, 1.5× and clear of the impact pads (the cyan-on-navy board read as a dark slot)
  ad_board_b: F(() => chevronBoard(ORANGE, WHITE, PANEL), station, true, 80),
  ad_board_c: F(() => holoBoard('c'), station, true, 80),
  tyre_wall: F(impactPads, () => MaterialLibrary.vertexLit(0.8, 0), true, 300),
  flag_pole: F(bannerMast, station, true, 200),
  gantry: F(stationArch, station, true),
  chevron: F(() => litChevron(ORANGE, 0.9, { panel: WHITE, scale: 1.5 }), station, true, 256),
  // hazards and compiler props
  hazard_press: F(press, hull, true),
  hazard_laser: F(laserGate, hull, false),
  hazard_train: F(maglev, hull, true),
  pillar: F(truss, station, true),
  gore_cushion: F(goreCushion, station, true),
};
