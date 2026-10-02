// Ember Mine dressing (2026-10 stylized pass, docs/design/34-stylized-pass.md §6): cave versions of the shared dressing
// kinds — pebble scree, crystal sprouts, rubble mounds, basalt chunks, stalagmite columns, far stalagmite forests —
// plus mine furniture (work-lamp masts, hazard masts, a miners' scaffold stand, a hard-hat crowd, mine signs, crates
// and barrels, timber cribs, pipe runs). Glow stays limited: lamp glass and ore glints use HDR vertex colours on the
// lit glow material (glow.ts), crystal sprouts sit below the High bloom threshold. Frame as props.ts: +X faces the
// road, +Z along the track, y = 0 is road height − 0.2 m; floor props reach below 0 so they never hover on slopes.
import * as THREE from 'three/webgpu';
import type { PropFactory } from '../../props/defaults.ts';
import { box, cone, cyl, merge, paint, place, rbox, sph, sparkleGeometry, torus } from '../../util/geo.ts';
import { glowLit } from '../lantern_hollow/glow.ts';
import { beam, crystal, rng, rock } from './shapes.ts';

const lit = (): THREE.Material => glowLit(0.85, 1.3);

// cave palette: mid-value basalt and timber (never black), amber work light, cyan / violet crystal
const E = {
  basalt: '#4c4440', basaltMid: '#5d534d', basaltLight: '#73665d', scree: '#6b5f57', screeLight: '#857769', dust: '#5a4c44',
  timber: '#8b5a2b', timberDark: '#6b4226', rust: '#9a5530', rustDark: '#7a3f24', steel: '#6d7178', amber: '#ffc857',
  hazard: '#f2b632', ink: '#1f1c1e', cyan: '#7fdbff', violet: '#c77dff', ivory: '#f2ead8', teal: '#3a8f8a', slate: '#3b3f4a',
  ore: '#f0a83c',
} as const;
const lamp = (k = 1.9): THREE.Color => new THREE.Color('#ffd28a').multiplyScalar(k);

/** Small crystal sprout cluster painted with a gentle HDR gain (self-lit, below the bloom threshold). */
function sprouts(seed: number): THREE.BufferGeometry[] {
  const R = rng(seed), out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2, d = R() * 0.45, h = 0.25 + R() * 0.45, c = new THREE.Color(i % 2 ? E.cyan : E.violet).multiplyScalar(1.45);
    for (const g of crystal(0.05 + R() * 0.04, h)) out.push(paint(place(g, Math.cos(a) * d, -0.05, Math.sin(a) * d, (R() - 0.5) * 0.6, R() * 3, (R() - 0.5) * 0.6), c));
  }
  return out;
}

/** Mine signboard on posts above the 1.4 m rock wall: hazard stripes, amber chevrons or a rust checker. */
function mineSign(v: 'a' | 'b' | 'c'): THREE.BufferGeometry {
  const W = 3.0, H = 0.95, y = 1.55 + H / 2;
  const p: THREE.BufferGeometry[] = [
    paint(place(box(0.12, y + 0.3, 0.12), -0.05, (y - 0.3) / 2, -W / 2 + 0.25), E.timberDark), paint(place(box(0.12, y + 0.3, 0.12), -0.05, (y - 0.3) / 2, W / 2 - 0.25), E.timberDark),
    paint(place(box(0.1, H + 0.12, W + 0.12), -0.06, y, 0), E.ink),
  ];
  const face = v === 'a' ? E.hazard : v === 'b' ? E.slate : E.rust;
  p.push(paint(place(box(0.04, H, W), 0.02, y, 0), face));
  if (v === 'a') {
    for (let k = 0; k < 7; k++) p.push(paint(place(box(0.03, 0.18, 0.95), 0.05, y, -1.2 + k * 0.4, -0.75, 0, 0), E.ink));
    p.push(paint(place(sparkleGeometry(0.3, 0.03, 11), 0.07, y, 0, 0, Math.PI / 2, 0), E.ivory));
  } else if (v === 'b') {
    // chevrons point along +Z (the travel direction once placed): on a bend's outside they point into the turn
    for (let k = 0; k < 4; k++) {
      const z = -0.9 + k * 0.6;
      p.push(paint(place(box(0.03, 0.5, 0.14), 0.05, y + 0.14, z, -0.8, 0, 0), E.amber), paint(place(box(0.03, 0.5, 0.14), 0.05, y - 0.14, z, 0.8, 0, 0), E.amber));
    }
  } else {
    for (let k = 0; k < 15; k++) p.push(paint(place(box(0.03, 0.2, 0.2), 0.05, y - H / 2 + 0.1, -W / 2 + 0.1 + k * 0.2), k % 2 ? E.ivory : E.ink));
    p.push(paint(place(sparkleGeometry(0.26, 0.03, 5), 0.05, y + 0.12, 0, 0, Math.PI / 2, 0), E.ivory));
  }
  // a caged bulb on top so the board reads in the dark
  p.push(paint(place(sph(0.12, 6, 4), 0.1, y + H / 2 + 0.18, 0), lamp(2.0)), paint(place(box(0.3, 0.06, 0.3), 0.1, y + H / 2 + 0.33, 0), E.ink));
  return merge(p);
}

/** Miners' scaffold stand: timber tiers on steel legs, amber / rust / teal seats, a hard-hat crowd, a rust roof. */
function scaffoldStand(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const L = 24, R = rng(401);
  const SEATS = [E.amber, E.rust, E.teal, E.ivory, E.screeLight];
  for (let i = 0; i < 5; i++) {
    const x = -1.6 - i * 1.25, top = 0.55 + i * 0.5;
    p.push(paint(place(box(1.25, top + 2.6, L), x, (top - 2.6) / 2, 0), E.timberDark, 0.05, i + 3));
    for (let k = 0; k < 12; k++) p.push(paint(place(box(0.5, 0.18, 1.8), x + 0.2, top + 0.09, -L / 2 + 1 + k * 2), SEATS[(i + k) % SEATS.length]!));
    for (let k = 0; k < 7; k++) {
      if (R() < 0.25) continue;
      const z = -L / 2 + 1.2 + k * 3.4 + R() * 1.2, hx = x + 0.15, hy = top + 0.9;
      p.push(paint(place(rbox(0.42, 0.55, 0.42, 0.12, 1), hx, top + 0.46, z), ['#5d7fb8', E.rust, E.teal, E.ivory, '#8fb573'][Math.floor(R() * 5)]!));
      p.push(paint(place(sph(0.2, 8, 6), hx, hy, z), ['#f0c9a0', '#c98e62', '#8a5a3c'][k % 3]!));
      p.push(paint(place(sph(0.23, 8, 4), hx, hy + 0.08, z, 0, 0, 0), E.hazard), paint(place(sph(0.05, 5, 3), hx + 0.21, hy + 0.12, z), lamp(2.2)));
    }
  }
  const back = -1.6 - 5 * 1.25;
  p.push(paint(place(box(0.3, 7.4, L + 0.6), back - 0.15, 1.1, 0), E.basaltMid));
  p.push(paint(place(box(0.25, 1.0, L), -0.85, 0.5, 0), E.timber), paint(place(box(0.06, 0.4, L - 0.2), -0.7, 0.75, 0), E.hazard));
  for (const z of [-L / 2 + 0.4, -L / 6, L / 6, L / 2 - 0.4]) p.push(paint(place(box(0.25, 7.6, 0.25), -0.9, 1.8, z), E.steel));
  for (let k = 0; k < 12; k++) p.push(paint(place(box(8.6, 0.2, L / 12 + 0.02), back / 2 - 0.4, 5.85, -L / 2 + (k + 0.5) * (L / 12), 0, 0, -0.12), k % 2 ? E.rust : E.rustDark));
  for (let k = 0; k < 5; k++) p.push(paint(place(cyl(0.02, 0.02, 0.6, 3), -0.8, 5.3, -L / 2 + 2.5 + k * 4.75), E.ink), paint(place(sph(0.16, 6, 4), -0.8, 4.95, -L / 2 + 2.5 + k * 4.75), lamp(2.2)));
  p.push(paint(place(sparkleGeometry(0.9, 0.08, 9), -0.6, 4.3, 0, 0, Math.PI / 2, 0), E.amber));
  return merge(p);
}

/** Hard-hat miners behind the wall, waving, with a banner on two props. */
function minerCrowd(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [], R = rng(411);
  const shirts = ['#5d7fb8', E.rust, E.teal, E.ivory, '#8fb573', E.amber];
  for (let i = 0; i < 9; i++) {
    const z = -2.4 + i * 0.6 + (R() - 0.5) * 0.2, x = -0.2 - R() * 0.9, hgt = 0.85 + R() * 0.3, hy = 0.55 + hgt;
    p.push(paint(place(rbox(0.42, hgt, 0.36, 0.12, 1), x, 0.35 + hgt / 2, z), shirts[i % shirts.length]!));
    p.push(paint(place(sph(0.21, 8, 6), x, hy, z), ['#f0c9a0', '#c98e62', '#8a5a3c'][i % 3]!));
    p.push(paint(place(sph(0.24, 8, 4), x, hy + 0.08, z, 0, 0, 0, 1, 0.75, 1), E.hazard), paint(place(sph(0.05, 5, 3), x + 0.22, hy + 0.1, z), lamp(2.2)));
    if (i % 3 === 1) p.push(paint(place(box(0.1, 0.5, 0.1), x + 0.05, 0.8 + hgt, z + 0.2, 0.3, 0, 0), shirts[(i + 2) % shirts.length]!));
  }
  p.push(paint(place(box(0.06, 0.6, 2.6), -0.05, 1.95, 0), E.amber), paint(place(box(0.07, 0.12, 2.6), -0.04, 1.7, 0), E.ink));
  p.push(paint(place(sparkleGeometry(0.22, 0.03, 9), -0.01, 2.0, 0, 0, Math.PI / 2, 0), E.ink));
  for (const z of [-1.35, 1.35]) p.push(paint(place(cyl(0.03, 0.03, 2.3, 5), -0.08, 1.15, z), E.timberDark));
  return merge(p);
}

export const EMBER_DRESSING: Record<string, PropFactory> = {
  // ---- floor cover -------------------------------------------------------------------------------------------------
  grass_tuft: {
    // pebble scree along the wall foot (the cave's "grass" layer), with a glinting ore chip now and then
    maxInstances: 6000,
    build: () => {
      const R = rng(421), p: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) {
        const a = R() * Math.PI * 2, d = R() * 0.45, r = 0.09 + R() * 0.12;
        p.push(paint(place(rock(r, i + 3, 0, 0.6), Math.cos(a) * d, r * 0.25, Math.sin(a) * d), [E.scree, E.screeLight, E.dust][i % 3]!));
      }
      p.push(paint(place(rock(0.07, 9, 0), 0.2, 0.06, -0.25), new THREE.Color(E.ore).multiplyScalar(1.5)));
      return { geometry: merge(p), material: lit() };
    },
  },
  grass_patch: {
    // 12 × 6 m clump of the floor-cover layer for hand-placed PROP lines where PROPS rows are excluded (start line,
    // pads, item rows): scree, two crystal sprout clusters, a rubble heap and a basalt chunk
    maxInstances: 80,
    build: () => {
      const R = rng(427), p: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 60; i++) { const r = 0.08 + R() * 0.16; p.push(paint(place(rock(r, i + 5, 0, 0.6), -R() * 6, r * 0.25, (R() - 0.5) * 12), [E.scree, E.screeLight, E.dust][i % 3]!)); }
      for (const [x, z] of [[-1.5, -3.5], [-3.6, 2.8]] as const) p.push(...sprouts(431 + x * 10).map((g) => place(g, x, 0, z, 0, 0, 0, 1.6)));
      p.push(paint(place(rock(0.9, 437, 1, 0.55), -4.4, 0.12, -1.0), E.basaltMid, 0.06, 3), paint(place(rock(0.6, 439, 1, 0.7), -2.2, 0.15, 4.8), E.basaltLight));
      return { geometry: merge(p), material: lit() };
    },
  },
  flower_patch: { maxInstances: 3000, build: () => ({ geometry: merge([paint(place(rock(0.35, 31, 1, 0.35), 0, 0.02, 0), E.basaltMid), ...sprouts(433)]), material: lit() }) },
  bush_round: {
    // rubble mound: broken basalt, a snapped plank and two ore glints
    maxInstances: 1500,
    build: () => {
      const R = rng(441), p: THREE.BufferGeometry[] = [paint(place(rock(0.95, 41, 1, 0.55), 0, 0.15, 0), E.basaltMid, 0.06, 3)];
      for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2, d = 0.6 + R() * 0.6; p.push(paint(place(rock(0.22 + R() * 0.2, 43 + i, 0), Math.cos(a) * d, 0.12, Math.sin(a) * d), i % 2 ? E.scree : E.basaltLight)); }
      p.push(paint(beam(-0.6, 0.15, -0.7, 0.4, 0.55, 0.5, 0.14), E.timber));
      for (const [x, z] of [[0.3, -0.2], [-0.35, 0.3]] as const) p.push(paint(place(rock(0.12, 47, 0), x, 0.62, z), new THREE.Color(E.ore).multiplyScalar(1.6)));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  rock_cluster: {
    maxInstances: 800,
    build: () => ({
      geometry: merge([
        paint(place(rock(0.75, 51, 1, 0.7), 0, 0.2, 0), E.basaltMid, 0.06, 3),
        paint(place(rock(0.48, 53, 1, 0.75), 0.85, 0.1, 0.3), E.basalt, 0.06, 5),
        paint(place(rock(0.32, 55, 0, 0.8), -0.65, 0.05, 0.55), E.basaltLight),
        paint(place(cyl(0.9, 1.3, 1.2, 7), 0, -0.6, 0), E.basalt),
      ]), material: lit(), castShadow: true,
    }),
  },
  tree_round_big: {
    // stalagmite column group (the mid layer): three columns and a small glowing crystal cluster at the foot (kept
    // under ~6.5 m and mid-value: taller dark cones stood between the camera and the corners like black spikes)
    maxInstances: 800,
    build: () => {
      const R = rng(461), p: THREE.BufferGeometry[] = [paint(place(rock(1.8, 61, 1, 0.6), 0, -0.4, 0), E.basalt, 0.08, 3), paint(place(cyl(1.8, 2.4, 6, 7), 0, -3.4, 0), E.basalt)];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + R(), d = i === 0 ? 0 : 0.9 + R() * 0.6, h = i === 0 ? 6.5 : 2.8 + R() * 2;
        p.push(paint(place(cone(0.6 + h * 0.13, h, 7), Math.cos(a) * d, h / 2 + 0.1, Math.sin(a) * d), [E.screeLight, E.scree, E.basaltLight][i]!, 0.1, i * 7 + 5));
        p.push(paint(place(cyl(0.6 + h * 0.1, 0.75 + h * 0.11, 0.5, 7), Math.cos(a) * d, 0.2, Math.sin(a) * d), E.dust));
      }
      p.push(...sprouts(467).map((g) => place(g, 1.3, 0, 0.9, 0, 0, 0, 2.2)));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  tree_clump: {
    // far stalagmite forest: nine columns 4–12 m in a 16 m patch (the cavern's horizon)
    maxInstances: 400,
    build: () => {
      const R = rng(471), p: THREE.BufferGeometry[] = [paint(place(rock(7, 71, 1, 0.25), 0, -0.6, 0), E.basalt)];
      for (let i = 0; i < 9; i++) {
        const x = (R() - 0.5) * 14, z = (R() - 0.5) * 14, h = 4 + R() * 8;
        p.push(paint(place(cone(0.7 + h * 0.12, h, 6), x, h / 2 - 0.3, z), i % 3 ? E.basaltMid : E.scree, 0.08, i + 3));
      }
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  // ---- mine furniture -----------------------------------------------------------------------------------------------
  lamp_post: {
    // work-lamp mast: a steel post on a basalt footing, a cross arm and two caged amber lamps on a cable
    maxInstances: 200,
    build: () => ({
      geometry: merge([
        paint(place(rock(0.45, 81, 0, 0.6), 0, 0.05, 0), E.basaltMid), paint(place(box(0.16, 4.6, 0.16), 0, 2.3, 0), E.steel),
        paint(place(box(1.6, 0.12, 0.12), 0.55, 4.4, 0), E.steel), paint(place(cyl(0.012, 0.012, 1.6, 3), 0.55, 4.5, 0, 0, 0, Math.PI / 2), E.ink),
        ...[0.15, 1.15].flatMap((x) => [
          paint(place(cyl(0.02, 0.02, 0.35, 3), x, 4.22, 0), E.ink), paint(place(sph(0.17, 8, 6), x, 3.95, 0), lamp(2.0)),
          paint(place(torus(0.18, 0.02, 3, 8), x, 3.95, 0, Math.PI / 2, 0, 0), E.ink), paint(place(cone(0.24, 0.16, 8), x, 4.12, 0), E.hazard),
        ]),
        paint(place(box(0.3, 0.3, 0.06), 0.09, 1.4, 0), E.hazard),
      ]), material: lit(), castShadow: true,
    }),
  },
  flag_pole: {
    // hazard mast: yellow / black banded pole with a rust pennant and an amber beacon
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 10; k++) p.push(paint(place(cyl(0.06, 0.06, 0.6, 6), 0, 0.3 + k * 0.6, 0), k % 2 ? E.ink : E.hazard));
      p.push(paint(place(sph(0.13, 6, 4), 0, 6.15, 0), lamp(2.2)), paint(place(box(0.03, 0.9, 1.4), 0, 5.5, 0.72), E.rust), paint(place(box(0.035, 0.2, 1.4), 0, 5.5, 0.72), E.ivory));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  grandstand: { maxInstances: 4, build: () => ({ geometry: scaffoldStand(), material: lit(), castShadow: true }) },
  spectators: { maxInstances: 120, build: () => ({ geometry: minerCrowd(), material: lit(), castShadow: true }) },
  ad_board_a: { maxInstances: 60, build: () => ({ geometry: mineSign('a'), material: lit(), castShadow: true }) },
  ad_board_b: { maxInstances: 60, build: () => ({ geometry: mineSign('b'), material: lit(), castShadow: true }) },
  ad_board_c: { maxInstances: 60, build: () => ({ geometry: mineSign('c'), material: lit(), castShadow: true }) },
  crate_barrels: {
    // supply pile: two crates, three oil drums (amber / rust) and a coil of cable
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      p.push(paint(place(rbox(1.1, 0.9, 1.1, 0.05, 1), -0.9, 0.45, -0.9), E.timber, 0.05, 3), paint(place(rbox(0.9, 0.7, 0.9, 0.05, 1), -0.9, 1.25, -0.8), E.timberDark, 0.05, 5));
      for (const [x, z, c] of [[-0.6, 0.6, E.hazard], [-1.5, 0.4, E.rust], [-1.05, 1.35, E.rust]] as const) {
        p.push(paint(place(cyl(0.38, 0.38, 1.0, 10), x, 0.5, z), c), paint(place(cyl(0.4, 0.4, 0.06, 10), x, 0.68, z), E.ink), paint(place(cyl(0.4, 0.4, 0.06, 10), x, 0.32, z), E.ink));
      }
      p.push(paint(place(torus(0.32, 0.07, 5, 12), -0.2, 0.08, -0.2, Math.PI / 2, 0, 0), E.ink));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  timber_crib: {
    // stacked timber cribbing (a roof support pile) with an iron strap
    maxInstances: 200,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (let l = 0; l < 6; l++) for (const s of [-0.7, 0.7]) p.push(paint(place(box(l % 2 ? 0.32 : 2.0, 0.3, l % 2 ? 2.0 : 0.32), l % 2 ? -1.2 + s : -1.2, 0.15 + l * 0.3, l % 2 ? 0 : s), l % 2 ? E.timber : E.timberDark, 0.06, l + 3));
      p.push(paint(place(box(2.05, 0.08, 0.06), -1.2, 1.0, 0.0), E.steel));
      return { geometry: merge(p), material: lit(), castShadow: true };
    },
  },
  pipe_run: {
    // two steel pipes on trestles along the wall (8 m), a rust valve wheel and an amber gauge light
    maxInstances: 300,
    build: () => {
      const p: THREE.BufferGeometry[] = [];
      for (const y of [0.6, 1.05]) p.push(paint(place(cyl(0.16, 0.16, 8.2, 10), -0.5, y, 0, Math.PI / 2, 0, 0), y < 1 ? E.steel : E.rust));
      for (const z of [-3.4, 0, 3.4]) p.push(paint(place(box(0.5, 1.3, 0.12), -0.5, 0.65, z), E.timberDark));
      p.push(paint(place(torus(0.24, 0.04, 4, 10), -0.18, 1.05, 1.5, 0, Math.PI / 2, 0), E.rust), paint(place(sph(0.07, 5, 3), -0.32, 1.35, -1.6), lamp(2.0)));
      // satin steel; the gauge light is an HDR vertex colour, so this is the glow material at a lower roughness
      return { geometry: merge(p), material: glowLit(0.55, 1.3), castShadow: true };
    },
  },
  lava_seam: {
    // a 4 m lava seam at the foot of the wall (rows at offset ~0.1): a basalt lip with a glowing crack in front of it.
    // The crack is HDR vertex colour on the glow material (emission ≈ 1.8 red / 1.5 amber, above the 0.8 bloom knee),
    // so on Magma Switchback the lava, not the lamps, is the brightest source on the start straight.
    maxInstances: 600,
    build: () => {
      const R = rng(733), p: THREE.BufferGeometry[] = [];
      let z = -2;
      for (let i = 0; i < 4; i++) {
        const l = 0.7 + R() * 0.5, x = 0.32 + (R() - 0.5) * 0.12, hot = i % 2 === 1;
        p.push(paint(place(box(0.2, 0.08, l), x, 0.2, z + l / 2, 0, (R() - 0.5) * 0.25, 0), new THREE.Color(hot ? E.amber : '#ff6a2b').multiplyScalar(hot ? 2.2 : 2.4)));
        z += l + 0.12;
      }
      p.push(paint(place(box(0.24, 0.22, 4.1), 0.08, 0.11, 0), E.basalt, 0.08, 7));
      return { geometry: merge(p), material: lit(), castShadow: false };
    },
  },
};

