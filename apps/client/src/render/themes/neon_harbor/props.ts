// Neon Harbor prop kit: a rain-wet harbour city at night and dusk. Local frame for PROPS rows: +Z along the track,
// +X toward the road, y = 0 on the ground; every roadside piece keeps its front at x ≈ 0 and builds back (−X), so a
// row's `offset` is its clearance from the road edge. Bodies are lit and matte (concrete, painted steel, fabric) and
// only real lights glow (GlowParts gains, see glowlit.ts): windows and screens stay under the bloom threshold, lamp
// lenses and neon tubes bloom. Every sign is original abstract art (bars, rings and the parametric sparkle); no real
// brands, lettering or logos.
// Dressing pass (2026-10, 34-stylized-pass): street facades with shop fronts, shophouses, a harbour warehouse,
// slim skyline towers, planters, street trees, benches, vending machines, bus shelters, cargo crates, lantern
// strings, neon sponsor boards and a neon start gantry. Instanced, one draw per kind.
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../../materials/library.ts';
import type { PropFactory } from '../../props/defaults.ts';
import { box, cone, cyl, ico, merge, paint, place, rbox, sparkleGeometry, sph, torus } from '../../util/geo.ts';
import { beam, glow, rng } from '../ember_mine/shapes.ts';
import { part, prism } from '../clayhill_village/toyshapes.ts';
import { GlowParts, glowLit } from './glowlit.ts';

const lit = (): THREE.Material => MaterialLibrary.vertexLit(0.7, 0);
const metal = (): THREE.Material => MaterialLibrary.vertexLit(0.45, 0.5);
/** Matte lit bodies with glowing accents (one material for nearly every city prop). */
const city = (): THREE.Material => glowLit(0.8, 0);
const leafy = (): THREE.Material => MaterialLibrary.foliageLit();

const NIGHT = '#141824', STEEL = '#3a3f4c', CONCRETE = '#6f7380';
const MAGENTA = '#ff3ea5', CYAN = '#3ee6ff', AMBER = '#ffb347', VIOLET = '#9b6bff', WARM = '#ffd98a';
const SODIUM = '#ffbe73', COOL = '#dcefff', INK = '#1d2029', GLASS_DK = '#1e2533', POLE = '#3b3f4a';
/** Facade palette: slate, dusk blue, plum and warm grey bodies with one trim each (organised, low saturation). */
const FACADES = [
  { body: '#4a5266', trim: '#2b3040' }, { body: '#3f4a68', trim: '#262d42' },
  { body: '#5a4a62', trim: '#33293a' }, { body: '#6a6466', trim: '#3a3536' },
] as const;
const AWNINGS = ['#d8426e', '#2b9fb3', '#e0a33a', '#7a5bc4', '#3f8f6a'] as const;
const WINDOW_LIT = [WARM, WARM, SODIUM, COOL, '#ffe6c4'] as const;

// ---- skyline (scatter and far rows) -----------------------------------------------------------------------------

/** Window bands on the four faces of a w × d block from y0 to y1: small panes, a third of them dark. */
function windowBands(G: GlowParts, w: number, d: number, y0: number, y1: number, seed: number, step = 3.2): void {
  const R = rng(seed);
  for (let y = y0 + 1.8; y < y1 - 1; y += step) {
    for (const [fw, fx, fz, ry] of [[w, 0, d / 2 + 0.04, 0], [w, 0, -d / 2 - 0.04, Math.PI], [d, w / 2 + 0.04, 0, Math.PI / 2], [d, -w / 2 - 0.04, 0, -Math.PI / 2]] as const) {
      const n = Math.max(2, Math.round(fw / 2.6));
      for (let i = 0; i < n; i++) {
        const off = -fw / 2 + (i + 0.5) * (fw / n);
        const px = ry === 0 || ry === Math.PI ? off : fx, pz = ry === 0 || ry === Math.PI ? fz : off;
        const on = R() >= 0.36;
        const pane = paint(place(new THREE.PlaneGeometry(fw / n - 0.9, 1.3), px, y, pz, 0, ry, 0), on ? WINDOW_LIT[Math.floor(R() * WINDOW_LIT.length)]! : GLASS_DK);
        if (on) G.light(0.55 + R() * 0.25, pane); else G.add(pane);
      }
    }
  }
}

/**
 * Slim slab tower: lit body, window bands, a red beacon. The footprint stays ≤ 7 × 6 m: scatter (scale up to 1.5)
 * keeps origins ≥ 6 m from every road edge, so a tower never reaches a road or a deck.
 */
function towerA(): THREE.BufferGeometry {
  const h = 52, G = new GlowParts();
  G.add(part(box(7, h, 6), '#2c3244', 0, h / 2 - 1, 0, 0, 0, 0, 1, 1, 1, 0.04, 3));
  G.add(part(box(7.5, 1.0, 6.5), '#1f2432', 0, h - 0.6, 0), part(box(2.6, 3, 2.6), '#1f2432', 1.3, h + 1.4, -0.9));
  G.light(2.6, part(box(0.6, 0.6, 0.6), '#ff2a3a', 1.3, h + 3.2, -0.9));
  G.light(1.6, part(box(7.6, 0.25, 6.6), CYAN, 0, h - 1.25, 0));
  windowBands(G, 7, 6, 0, h - 1.5, 11);
  return G.build();
}

/** Slim stepped tower: three setbacks, magenta crown bands and a crown ring. */
function towerB(): THREE.BufferGeometry {
  const G = new GlowParts();
  const tiers: [number, number, number][] = [[7, 0, 30], [5.4, 30, 48], [3.9, 48, 62]];
  for (const [s, y0, y1] of tiers) {
    G.add(part(box(s, y1 - y0, s), '#33304a', 0, (y0 + y1) / 2 - 1, 0, 0, 0, 0, 1, 1, 1, 0.04, 5));
    windowBands(G, s, s, y0, y1 - 1, 17 + y0);
    G.light(1.8, part(box(s + 0.3, 0.3, s + 0.3), MAGENTA, 0, y1 - 1, 0));
  }
  G.light(2.0, paint(place(torus(2.2, 0.16, 6, 24), 0, 64, 0, Math.PI / 2), MAGENTA));
  G.add(part(cyl(0.2, 0.3, 7, 6), STEEL, 0, 64.5, 0));
  G.light(2.6, part(sph(0.35, 6, 4), '#ff2a3a', 0, 68.2, 0));
  return G.build();
}

// ---- street facades ---------------------------------------------------------------------------------------------

interface FacadeSpec { w: number; d: number; floors: number; floorH: number; tone: number; seed: number; sign: boolean; roof: 'tank' | 'board' | 'ac' }

/**
 * A mid-rise street block: lit shop fronts with fabric awnings and sign boxes at street level, a grid of windows
 * (about half lit, warm and cool), floor trims, a roof with a water tank, a sign frame or AC units, and a vertical
 * neon blade sign on the front corner. Front face at x = 0, the block runs back to x = −d.
 */
function facade(f: FacadeSpec): THREE.BufferGeometry {
  const G = new GlowParts(), R = rng(f.seed);
  const { body, trim } = FACADES[f.tone % FACADES.length]!;
  const GF = 4.4, H = GF + f.floors * f.floorH;
  G.add(part(box(f.d, H, f.w), body, -f.d / 2, H / 2, 0, 0, 0, 0, 1, 1, 1, 0.03, f.seed));
  // street level: dark storefront band, glass bays, mullions, awnings and sign boxes
  G.add(part(box(0.35, GF, f.w + 0.02), INK, 0.05, GF / 2, 0));
  const bays = Math.max(2, Math.round(f.w / 5.2)), bw = f.w / bays;
  for (let i = 0; i < bays; i++) {
    const z = -f.w / 2 + (i + 0.5) * bw;
    const shop = R() < 0.82;
    const glass = part(box(0.06, 2.7, bw - 1.2), shop ? WINDOW_LIT[Math.floor(R() * WINDOW_LIT.length)]! : GLASS_DK, 0.25, 1.75, z);
    if (shop) G.light(0.7, glass); else G.add(glass);
    G.add(part(box(0.12, 2.8, 0.1), trim, 0.29, 1.75, z), part(box(0.14, 0.12, bw - 1.0), trim, 0.29, 0.38, z));
    const aw = AWNINGS[Math.floor(R() * AWNINGS.length)]!;
    G.add(part(box(1.6, 0.1, bw - 0.7), aw, 0.95, 3.32, z, 0, 0, -0.22), part(box(0.06, 0.32, bw - 0.7), aw, 1.73, 3.0, z));
    for (let k = 0; k < 4; k++) G.add(part(box(0.065, 0.33, (bw - 0.7) / 8), '#f2eee6', 1.765, 3.0, z - (bw - 0.7) / 2 + ((bw - 0.7) / 8) * (2 * k + 0.5)));
    G.light(R() < 0.5 ? 1.05 : 0.8, part(box(0.12, 0.5, bw * 0.55), R() < 0.5 ? MAGENTA : R() < 0.5 ? CYAN : AMBER, 0.33, 3.95, z));
  }
  // upper floors: trims and windows (front face, plus the first two bays of each side face for the gaps between blocks)
  const nW = Math.max(3, Math.round(f.w / 3.1)), ww = f.w / nW;
  for (let k = 0; k < f.floors; k++) {
    const y0 = GF + k * f.floorH;
    G.add(part(box(0.24, 0.22, f.w + 0.06), trim, 0.06, y0 + 0.11, 0));
    for (let j = 0; j < nW; j++) {
      const z = -f.w / 2 + (j + 0.5) * ww, on = R() < 0.55;
      const pane = part(box(0.08, 1.55, ww - 1.0), on ? WINDOW_LIT[Math.floor(R() * WINDOW_LIT.length)]! : GLASS_DK, 0.03, y0 + f.floorH * 0.55, z);
      if (on) G.light(0.5 + R() * 0.3, pane); else G.add(pane);
      G.add(part(box(0.22, 0.1, ww - 0.8), trim, 0.08, y0 + f.floorH * 0.55 - 0.85, z));
    }
    for (const sz of [-1, 1]) for (let j = 0; j < 2; j++) {
      const on = R() < 0.5;
      const pane = part(box(ww - 1.0, 1.55, 0.08), on ? WARM : GLASS_DK, -1.6 - j * 3.0, y0 + f.floorH * 0.55, sz * (f.w / 2 + 0.03));
      if (on) G.light(0.55, pane); else G.add(pane);
    }
  }
  // roof: parapet, then a water tank, a sign frame or AC units
  G.add(part(box(f.d + 0.2, 0.6, f.w + 0.2), trim, -f.d / 2, H + 0.3, 0));
  if (f.roof === 'tank') {
    const x = -f.d * 0.6, z = (R() - 0.5) * f.w * 0.5;
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) G.add(part(box(0.16, 2.2, 0.16), STEEL, x + dx, H + 1.1, z + dz));
    G.add(part(cyl(1.4, 1.4, 2.4, 12), '#7a6a5a', x, H + 3.4, z), part(cone(1.5, 0.8, 12), '#5a4c40', x, H + 5.0, z));
  } else if (f.roof === 'board') {
    // rooftop light box facing the road: violet field, magenta bars and a warm sparkle (original art)
    G.add(part(box(0.3, 4.4, f.w * 0.6), INK, -1.2, H + 3.0, 0));
    for (const zz of [-f.w * 0.22, f.w * 0.22]) G.add(part(box(0.2, 1.4, 0.2), STEEL, -1.4, H + 0.7, zz));
    G.light(0.45, part(box(0.06, 3.8, f.w * 0.56), '#4a2f8a', -1.02, H + 3.0, 0));
    for (let i = 0; i < 3; i++) G.light(1.1, part(box(0.06, 0.32, f.w * (0.3 - i * 0.06)), MAGENTA, -0.98, H + 2.0 + i * 0.75, f.w * 0.1));
    G.light(1.5, paint(place(sparkleGeometry(1.3, 0.08, 5), -0.95, H + 3.0, -f.w * 0.17, 0, Math.PI / 2, 0), WARM));
  } else {
    for (let i = 0; i < 3; i++) G.add(part(rbox(1.6, 1.0, 1.4, 0.1, 1), '#9a9ea8', -2.2 - i * 2.4, H + 1.1, (R() - 0.5) * f.w * 0.6));
  }
  // vertical neon blade sign on the front corner, well above the shop awnings
  if (f.sign) {
    // a blade sticks out from the wall (+X) and faces along the street (±Z), where the drivers see it
    const z = f.w / 2 - 1.2, y = GF + 2.2, h = Math.min(8, f.floors * f.floorH - 2.5);
    G.add(part(box(0.7, 0.2, 0.2), STEEL, 0.35, y + h - 0.3, z), part(box(0.7, 0.2, 0.2), STEEL, 0.35, y + 0.3, z));
    G.add(part(box(1.2, h, 0.3), INK, 1.25, y + h / 2, z));
    const c1 = R() < 0.5 ? MAGENTA : CYAN, c2 = c1 === MAGENTA ? CYAN : VIOLET;
    G.light(2.0, part(box(0.08, h - 0.2, 0.36), c1, 1.86, y + h / 2, z));
    for (const sz of [1, -1]) for (let i = 0; i < Math.floor(h / 1.2); i++) G.light(1.6, part(box(0.4 + R() * 0.5, 0.5, 0.05), c2, 1.2, y + 0.8 + i * 1.2, z + sz * 0.17));
  }
  return G.build();
}

/** Two-storey shophouse (market street): roll shutters and a lit noodle bar, balcony, red paper lanterns. */
function shophouse(seed: number): THREE.BufferGeometry {
  const G = new GlowParts(), R = rng(seed);
  const W = 13, D = 8, H = 8.2;
  const { body, trim } = FACADES[(seed % 2) + 2]!;
  G.add(part(box(D, H, W), body, -D / 2, H / 2, 0, 0, 0, 0, 1, 1, 1, 0.03, seed));
  G.add(part(box(0.35, 3.8, W), INK, 0.05, 1.9, 0));
  for (let i = 0; i < 3; i++) {
    const z = -W / 2 + (i + 0.5) * (W / 3);
    if (i === 1 || R() < 0.4) {
      G.light(0.75, part(box(0.06, 2.6, W / 3 - 0.9), i === 1 ? SODIUM : WARM, 0.25, 1.6, z));
      G.add(part(box(0.5, 0.9, W / 3 - 1.2), '#8a5a3a', 0.55, 0.45, z)); // counter
    } else {
      // roll shutter half down: ribbed metal over a lit gap
      G.add(part(box(0.08, 2.0, W / 3 - 0.9), '#8d929c', 0.26, 2.4, z));
      for (let k = 0; k < 6; k++) G.add(part(box(0.1, 0.05, W / 3 - 0.9), '#6f747e', 0.3, 1.5 + k * 0.33, z));
      G.light(0.6, part(box(0.06, 0.9, W / 3 - 0.9), WARM, 0.25, 0.75, z));
    }
  }
  // canopy and lanterns under the eaves
  G.add(part(box(1.9, 0.14, W + 0.4), '#b8322e', 1.0, 3.95, 0, 0, 0, -0.18));
  for (let k = 0; k < 6; k++) {
    const z = -W / 2 + 1.1 + k * ((W - 2.2) / 5);
    G.add(part(cyl(0.02, 0.02, 0.4, 3), INK, 1.75, 3.55, z));
    G.light(1.25, part(sph(0.3, 10, 8), k % 2 ? '#ff5a3a' : '#ffb347', 1.75, 3.15, z, 0, 0, 0, 1, 1.25, 1));
  }
  // first floor: balcony, windows, a blade sign
  G.add(part(box(1.1, 0.15, W - 1), trim, 0.5, 4.6, 0), part(box(0.06, 0.9, W - 1), '#9aa0aa', 1.0, 5.1, 0));
  for (let j = 0; j < 4; j++) {
    const z = -W / 2 + (j + 0.5) * (W / 4), on = R() < 0.6;
    const pane = part(box(0.08, 1.7, W / 4 - 1.2), on ? WINDOW_LIT[j % WINDOW_LIT.length]! : GLASS_DK, 0.03, 6.0, z);
    if (on) G.light(0.6, pane); else G.add(pane);
  }
  G.add(part(box(D + 0.3, 0.5, W + 0.3), trim, -D / 2, H + 0.25, 0));
  G.add(part(box(0.3, 3.2, 1.0), INK, 0.9, 6.4, W / 2 - 1));
  G.light(1.7, part(box(0.08, 2.8, 0.7), R() < 0.5 ? '#ff5a3a' : MAGENTA, 1.08, 6.4, W / 2 - 1));
  return G.build();
}

/** Harbour warehouse: ribbed walls, two lit roll-up doors, a gable roof, dock lamps and our sparkle on the gable. */
function warehouse(): THREE.BufferGeometry {
  const G = new GlowParts();
  const W = 30, D = 18, H = 9;
  G.add(part(box(D, H, W), '#5d6b7a', -D / 2, H / 2, 0, 0, 0, 0, 1, 1, 1, 0.02, 7));
  for (let z = -W / 2 + 0.5; z < W / 2; z += 1.0) G.add(part(box(0.12, H - 0.4, 0.18), '#4d5a68', 0.06, H / 2, z));
  for (const z of [-7, 7]) {
    G.add(part(box(0.2, 5.4, 6.4), '#2a2f38', 0.12, 2.7, z));
    G.light(0.6, part(box(0.06, 2.2, 5.6), SODIUM, 0.22, 1.1, z));
    for (let k = 0; k < 8; k++) G.add(part(box(0.1, 0.06, 5.6), '#9ba6b2', 0.26, 2.5 + k * 0.38, z));
    G.add(part(box(0.5, 0.4, 0.3), '#2a2d36', 0.4, 5.9, z), part(box(0.2, 0.2, 0.2), '#2a2d36', 0.15, 5.9, z));
    G.light(2.2, part(box(0.06, 0.16, 0.3), '#fff1c8', 0.62, 5.72, z));
    for (const dz of [-3.4, 3.4]) for (let k = 0; k < 3; k++) G.add(part(box(0.3, 0.25, 0.3), k % 2 ? INK : '#f2c230', 0.18, 0.2 + k * 0.25, z + dz));
  }
  // gable roof, ridge along Z
  G.add(part(prism(D + 0.6, 2.8, W + 0.6), '#3a4452', -D / 2, H, 0));
  G.light(1.4, paint(place(sparkleGeometry(1.4, 0.08, 9), 0.2, H - 1.6, 0, 0, Math.PI / 2, 0), '#ff8a3a'));
  return G.build();
}

// ---- street furniture -------------------------------------------------------------------------------------------

/** Sodium street lamp leaning over the road (+X): matte pole, dark housing, a glowing lens. */
function streetLamp(): THREE.BufferGeometry {
  return new GlowParts()
    .add(part(cyl(0.28, 0.32, 0.6, 8), '#2f333c', 0, 0.3, 0), part(cyl(0.12, 0.17, 8, 8), POLE, 0, 4, 0))
    .add(paint(beam(0, 7.85, 0, 2.6, 8.45, 0, 0.16), POLE), part(rbox(1.3, 0.32, 0.62, 0.08, 2), '#2a2d36', 2.8, 8.4, 0))
    .light(2.6, part(box(1.1, 0.1, 0.46), SODIUM, 2.8, 8.22, 0))
    .build();
}

/** Traffic signal on a mast arm over the road edge (+X): the heads face the oncoming karts (−Z), green lit. */
function trafficSignal(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(cyl(0.22, 0.26, 0.4, 8), '#2f333c', 0, 0.2, 0), part(cyl(0.11, 0.14, 6.2, 8), POLE, 0, 3.1, 0));
  G.add(part(box(4.2, 0.14, 0.14), POLE, 2.1, 6.0, 0));
  for (const x of [1.6, 3.8]) {
    G.add(part(rbox(0.42, 1.2, 0.36, 0.06, 1), '#23262f', x, 5.35, 0), part(box(0.5, 1.3, 0.04), '#f2c230', x, 5.35, 0.2));
    G.add(part(cyl(0.13, 0.13, 0.05, 10), '#3a1c1c', x, 5.72, -0.19, Math.PI / 2), part(cyl(0.13, 0.13, 0.05, 10), '#3a321c', x, 5.35, -0.19, Math.PI / 2));
    G.light(1.8, part(cyl(0.13, 0.13, 0.05, 10), '#3dff9a', x, 4.98, -0.19, Math.PI / 2));
    for (const y of [5.72, 5.35, 4.98]) G.add(part(box(0.3, 0.04, 0.12), '#23262f', x, y + 0.16, -0.24));
  }
  G.add(part(box(0.5, 0.36, 0.06), '#2b6fd0', 0.0, 4.2, -0.12));
  return G.build();
}

/** Concrete planter box with a clipped hedge and a few blossoms (city ground cover; thins with the bush tier). */
function planter(): THREE.BufferGeometry {
  return merge([
    part(box(1.0, 0.7, 2.6), '#8e8a84', -0.5, 0.35, 0), part(box(1.1, 0.08, 2.7), '#a6a29c', -0.5, 0.72, 0),
    part(ico(0.55, 1), '#3d6b45', -0.5, 0.95, -0.7, 0, 0, 0, 0.9, 0.75, 1.0, 0.06, 3),
    part(ico(0.6, 1), '#4a7d4f', -0.5, 1.0, 0.1, 0, 0, 0, 0.9, 0.8, 1.0, 0.06, 5),
    part(ico(0.5, 1), '#3a6342', -0.5, 0.92, 0.85, 0, 0, 0, 0.9, 0.75, 1.0, 0.06, 7),
    ...[[-0.3, 1.3, -0.5], [-0.65, 1.35, 0.3], [-0.35, 1.25, 0.9], [-0.7, 1.3, -0.9]].map(([x, y, z], i) => part(ico(0.09, 0), i % 2 ? '#f2a6c4' : '#f6f0e6', x!, y!, z!)),
  ]);
}

/** Street tree in a square pit (canopy sways). */
function streetTree(): THREE.BufferGeometry {
  return merge([
    part(box(1.4, 0.18, 1.4), '#5a5e66', 0, 0.09, 0), part(box(1.0, 0.2, 1.0), '#2b2e33', 0, 0.11, 0),
    part(cyl(0.14, 0.2, 3.2, 6), '#5a4232', 0, 1.6, 0),
    part(ico(1.5, 1), '#335c3c', 0, 4.0, 0, 0, 0, 0, 1.1, 0.95, 1.1, 0.06, 3),
    part(ico(1.1, 1), '#3f6d45', 0.7, 4.7, 0.4, 0, 0, 0, 1, 0.9, 1, 0.06, 5),
    part(ico(1.0, 1), '#2e5236', -0.6, 4.5, -0.5, 0, 0, 0, 1, 0.9, 1, 0.06, 7),
  ]);
}

/** Bench with wooden slats, a litter bin and a bollard (faces the road). */
function bench(): THREE.BufferGeometry {
  const p = [part(box(0.5, 0.06, 1.8), '#9a6a44', -0.4, 0.46, 0), part(box(0.06, 0.4, 1.8), '#9a6a44', -0.66, 0.72, 0)];
  for (const z of [-0.75, 0.75]) p.push(part(box(0.5, 0.45, 0.08), INK, -0.4, 0.23, z));
  p.push(part(cyl(0.26, 0.24, 0.85, 10), '#2f5a4a', -0.4, 0.43, 1.5), part(cyl(0.29, 0.29, 0.08, 10), '#22433a', -0.4, 0.88, 1.5));
  p.push(part(cyl(0.12, 0.14, 0.9, 8), '#3a3f4c', -0.1, 0.45, -1.5), part(cyl(0.125, 0.125, 0.12, 8), '#f2c230', -0.1, 0.75, -1.5));
  return merge(p);
}

/** Two vending machines with lit fronts and a small canopy. */
function vending(): THREE.BufferGeometry {
  const G = new GlowParts();
  const bodies = ['#e9edf2', '#d8424a'] as const;
  bodies.forEach((b, i) => {
    const z = (i - 0.5) * 1.05;
    G.add(part(rbox(0.75, 1.9, 1.0, 0.06, 1), b, -0.4, 0.95, z));
    G.light(0.8, part(box(0.04, 1.0, 0.8), i ? '#ffe7b0' : COOL, 0.0, 1.25, z));
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) G.light(0.7, part(box(0.03, 0.14, 0.12), [MAGENTA, CYAN, AMBER, '#7ad86a'][(r + k + i) % 4]!, 0.03, 0.98 + r * 0.28, z - 0.27 + k * 0.18));
    G.add(part(box(0.06, 0.3, 0.7), INK, 0.0, 0.42, z));
  });
  G.add(part(box(1.1, 0.08, 2.4), '#3a3f4c', -0.3, 2.05, 0, 0, 0, -0.1));
  return G.build();
}

/** Bus shelter: dark frame, smoked back glass, a lit ad panel (sparkle and bars) and a bench. */
function busShelter(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const z of [-2.4, 2.4]) G.add(part(box(0.12, 2.6, 0.12), '#2a2d36', -1.4, 1.3, z), part(box(0.12, 2.6, 0.12), '#2a2d36', 0, 1.3, z));
  G.add(part(box(1.8, 0.12, 5.2), '#2a2d36', -0.7, 2.66, 0, 0, 0, -0.05), part(box(0.05, 2.0, 4.6), '#384050', -1.4, 1.3, 0));
  G.add(part(box(0.5, 0.06, 3.2), '#9a6a44', -1.05, 0.5, -0.5), part(box(0.4, 0.45, 0.08), INK, -1.05, 0.25, -1.9), part(box(0.4, 0.45, 0.08), INK, -1.05, 0.25, 0.9));
  G.add(part(box(0.15, 1.9, 1.3), '#2a2d36', -0.1, 1.15, 1.8));
  G.light(0.75, part(box(0.04, 1.7, 1.1), '#6a4cc4', -0.01, 1.15, 1.8));
  G.light(1.2, paint(place(sparkleGeometry(0.35, 0.03, 3), 0.03, 1.45, 1.8, 0, Math.PI / 2, 0), WARM));
  for (let i = 0; i < 3; i++) G.light(0.9, part(box(0.03, 0.1, 0.8 - i * 0.2), CYAN, 0.03, 0.7 + i * 0.18, 1.8));
  return G.build();
}

/** Stacked cargo crates and pallets with a tarp (harbour ground cover). */
function crates(): THREE.BufferGeometry {
  const R = rng(51), p: THREE.BufferGeometry[] = [];
  const woods = ['#a27a4e', '#8e6a44', '#b58b5a'] as const;
  p.push(part(box(1.4, 0.15, 2.6), '#7a5a3c', -0.8, 0.075, 0));
  for (let i = 0; i < 5; i++) {
    const s = 0.8 + R() * 0.4, lv = i < 3 ? 0 : 1, z = lv === 0 ? -0.9 + i * 0.9 : -0.45 + (i - 3) * 0.9;
    p.push(part(box(s, s, s), woods[i % 3]!, -0.8 + (R() - 0.5) * 0.2, 0.15 + s / 2 + lv * 0.95, z, 0, (R() - 0.5) * 0.3, 0));
    p.push(part(box(s + 0.02, 0.1, s + 0.02), '#6a4c30', -0.8, 0.25 + lv * 0.95, z));
  }
  p.push(part(rbox(1.3, 0.9, 1.5, 0.2, 2), '#2b6f8a', -2.4, 0.45, 0.6), part(box(1.0, 0.12, 1.2), '#7a5a3c', -2.4, 0.06, -1.3));
  return merge(p);
}

/** Paper-lantern string across the market street (PROP; local X across the road, ±9 m posts). */
function lanternString(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (const x of [-9.2, 9.2]) G.add(part(cyl(0.1, 0.13, 7.2, 6), POLE, x, 3.6, 0));
  const N = 11;
  for (let i = 0; i <= N; i++) {
    const a = -9.2 + (18.4 * i) / N, b = -9.2 + (18.4 * (i + 1)) / N;
    const sag = (x: number): number => 6.9 - 1.1 * (1 - (x / 9.2) * (x / 9.2));
    if (i < N) G.add(paint(beam(a, sag(a), 0, b, sag(b), 0, 0.03), INK));
    if (i > 0 && i < N) {
      G.add(part(cyl(0.02, 0.02, 0.3, 3), INK, a, sag(a) - 0.15, 0));
      G.light(1.3, part(sph(0.32, 10, 8), i % 3 === 1 ? '#ffb347' : '#ff5a3a', a, sag(a) - 0.55, 0, 0, 0, 0, 1, 1.3, 1));
      G.add(part(cyl(0.18, 0.18, 0.06, 8), INK, a, sag(a) - 0.12, 0), part(cyl(0.16, 0.16, 0.06, 8), INK, a, sag(a) - 0.98, 0));
    }
  }
  return G.build();
}

/** Noodle stall: counter, red canopy, a lantern pair and a steaming pot (lit menu board, no lettering). */
function noodleStall(): THREE.BufferGeometry {
  const G = new GlowParts();
  G.add(part(box(1.4, 1.0, 3.2), '#8a5a3a', -0.9, 0.5, 0), part(box(1.5, 0.08, 3.3), '#d8c7a8', -0.9, 1.04, 0));
  for (const z of [-1.5, 1.5]) G.add(part(box(0.08, 2.4, 0.08), INK, -0.25, 1.2, z), part(box(0.08, 2.4, 0.08), INK, -1.55, 1.2, z));
  G.add(part(box(1.8, 0.1, 3.6), '#c43a32', -0.9, 2.45, 0, 0, 0, -0.12));
  for (let k = 0; k < 6; k++) G.add(part(box(0.06, 0.25, 0.6), k % 2 ? '#f2eee6' : '#c43a32', 0.02, 2.25, -1.5 + k * 0.6));
  for (const z of [-1.2, 1.2]) G.light(1.3, part(sph(0.22, 8, 6), '#ff5a3a', 0.0, 1.9, z, 0, 0, 0, 1, 1.3, 1));
  G.add(part(cyl(0.3, 0.26, 0.4, 10), '#8d929c', -1.0, 1.28, -0.6));
  G.light(0.6, part(box(0.04, 0.6, 1.0), '#ffe0a0', -1.6, 1.6, 0.5));
  for (let k = 0; k < 3; k++) G.add(part(cyl(0.2, 0.2, 0.45, 8), '#c43a32', 0.35, 0.22, -0.9 + k * 0.9), part(cyl(0.05, 0.05, 0.3, 4), INK, 0.35, 0.5, -0.9 + k * 0.9));
  return G.build();
}

// ---- racing furniture (city versions of the shared kinds) ---------------------------------------------------------

/** Neon sponsor board: a lit light-box face above the barrier, our sparkle and bars only (original art). */
function neonBoard(v: 'a' | 'b' | 'c'): THREE.BufferGeometry {
  const W = 3.0, H = 0.95, y = 1.25 + H / 2, G = new GlowParts();
  G.add(part(box(0.09, y, 0.09), POLE, -0.05, y / 2, -W / 2 + 0.25), part(box(0.09, y, 0.09), POLE, -0.05, y / 2, W / 2 - 0.25));
  G.add(part(box(0.12, H + 0.12, W + 0.12), '#23262f', -0.07, y, 0));
  const field = v === 'a' ? '#3a1f4a' : v === 'b' ? '#14304a' : '#2a2338';
  G.light(0.5, part(box(0.04, H, W), field, 0.0, y, 0));
  if (v === 'a') {
    G.light(1.2, paint(place(sparkleGeometry(0.34, 0.03, 11), 0.04, y, -0.85, 0, Math.PI / 2, 0), MAGENTA));
    G.light(0.95, part(box(0.03, 0.14, 1.6), '#f4f1ea', 0.04, y + 0.12, 0.45), part(box(0.03, 0.09, 1.2), MAGENTA, 0.04, y - 0.16, 0.25));
  } else if (v === 'b') {
    // chevrons point along +Z (the travel direction once placed): on a bend's outside they point into the turn
    for (let k = 0; k < 4; k++) {
      const z = -0.9 + k * 0.6;
      G.light(1.0, part(box(0.03, 0.5, 0.14), '#ffd23f', 0.04, y + 0.14, z, -0.8, 0, 0), part(box(0.03, 0.5, 0.14), '#ffd23f', 0.04, y - 0.14, z, 0.8, 0, 0));
    }
  } else {
    for (let k = 0; k < 15; k++) G.light(k % 2 ? 0.95 : 0.5, part(box(0.03, 0.2, 0.2), k % 2 ? CYAN : '#14304a', 0.04, y - H / 2 + 0.1, -W / 2 + 0.1 + k * 0.2));
    G.light(1.2, paint(place(sparkleGeometry(0.28, 0.03, 5), 0.04, y + 0.12, 0, 0, Math.PI / 2, 0), CYAN));
  }
  return G.build();
}

/** City banner pole (start straight): slim light pole, a vertical fabric banner and a small lamp. */
function bannerPole(): THREE.BufferGeometry {
  const G = new GlowParts();
  G.add(part(cyl(0.07, 0.09, 6.4, 6), POLE, 0, 3.2, 0));
  G.add(part(box(0.04, 2.4, 0.9), '#d8426e', 0, 4.2, 0.5), part(box(0.045, 0.3, 0.9), '#f4f1ea', 0, 3.1, 0.5));
  G.add(paint(place(sparkleGeometry(0.22, 0.03, 9), 0.03, 4.6, 0.5, 0, Math.PI / 2, 0), '#f4f1ea'));
  G.add(part(box(0.5, 0.06, 0.06), POLE, 0.2, 6.3, 0));
  G.light(2.0, part(sph(0.13, 8, 6), SODIUM, 0.45, 6.2, 0));
  return G.build();
}

/** Neon start gantry (local X across the road, ±9.4 m; scaled by road width / 16): dark truss, magenta tubes, checker header, start lamps. */
function neonGantry(): THREE.BufferGeometry {
  const G = new GlowParts();
  const DARK = '#262a36', WHITE = '#f1eef6';
  for (const x of [-9.4, 9.4]) {
    for (const dx of [-0.36, 0.36]) for (const dz of [-0.36, 0.36]) G.add(part(box(0.14, 6.6, 0.14), DARK, x + dx, 3.4, dz));
    for (let i = 0; i < 6; i++) {
      const y = 0.75 + i * 1.0, tilt = i % 2 ? 0.8 : -0.8;
      for (const dz of [-0.36, 0.36]) G.add(part(box(0.08, 1.25, 0.08), '#5a6070', x, y, dz, 0, 0, tilt));
    }
    G.light(2.2, part(box(0.06, 6.4, 0.06), MAGENTA, x - 0.44, 3.4, -0.44), part(box(0.06, 6.4, 0.06), MAGENTA, x + 0.44, 3.4, -0.44));
    G.add(part(rbox(1.3, 0.7, 1.3, 0.08, 1), '#7a7e8a', x, 0.25, 0));
    for (let i = 0; i < 4; i++) G.add(part(box(1.32, 0.12, 1.32), i % 2 ? INK : '#f2c230', x, 0.06 + i * 0.16, 0));
  }
  G.add(part(box(20.2, 1.9, 0.7), DARK, 0, 7.35, 0));
  for (const z of [-0.37, 0.37]) {
    for (let i = 0; i < 48; i++) for (const [y, o] of [[8.12, 0], [6.58, 1]] as const) G.add(part(box(0.4, 0.3, 0.05), (i + o) % 2 ? INK : WHITE, -9.4 + i * 0.4, y, z * 1.03));
    G.add(part(box(19.4, 1.1, 0.04), '#1a1d28', 0, 7.35, z));
    G.light(1.8, paint(place(sparkleGeometry(0.62, 0.06, 7), 0, 7.35, z * 1.06, 0, z > 0 ? 0 : Math.PI, 0), CYAN));
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) G.light(1.6, part(box(0.5, 0.16, 0.05), MAGENTA, sx * (2.4 + k * 0.75), 7.5, z * 1.04, 0, 0, sx * 0.6), part(box(0.5, 0.16, 0.05), MAGENTA, sx * (2.4 + k * 0.75), 7.2, z * 1.04, 0, 0, -sx * 0.6));
    G.light(2.0, part(box(19.4, 0.06, 0.06), CYAN, 0, 6.38, z * 1.1));
  }
  for (let i = 0; i < 5; i++) {
    const x = -2.4 + i * 1.2;
    G.add(part(rbox(0.9, 0.62, 0.5, 0.08, 1), INK, x, 6.05, -0.25));
    for (const dx of [-0.2, 0.2]) G.light(1.4, part(cyl(0.15, 0.15, 0.06, 10), '#e5484d', x + dx, 6.05, -0.52, Math.PI / 2, 0, 0));
  }
  return G.build();
}

// ---- legacy kinds (kept: tracks and hazards name them) -------------------------------------------------------------

/** Vertical blade sign on a pole: stacked abstract glyph bars and a ring, magenta/cyan. */
function neonSign(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(cyl(0.2, 0.26, 9, 6), POLE, 0, 4.5, 0), part(rbox(0.5, 7.2, 2.6, 0.12, 2), NIGHT, 0, 9.6, 0));
  const R = rng(29);
  for (let i = 0; i < 6; i++) {
    const c = i % 2 ? CYAN : MAGENTA, w = 0.8 + R() * 1.2;
    for (const sx of [1, -1]) G.light(1.8, part(box(0.08, 0.5, w), c, sx * 0.29, 6.8 + i * 1.05, (R() - 0.5) * 0.6));
  }
  for (const sx of [1, -1]) G.light(1.6, paint(place(torus(0.8, 0.12, 5, 16), sx * 0.3, 13.6, 0, 0, Math.PI / 2), AMBER));
  return G.build();
}

/** Roadside billboard: two legs, a lit frame and a sparkle-and-stripes panel (original art). */
function billboard(): THREE.BufferGeometry {
  const G = new GlowParts()
    .add(part(box(0.6, 7, 0.6), STEEL, -0.3, 3.5, -5), part(box(0.6, 7, 0.6), STEEL, -0.3, 3.5, 5), part(box(0.5, 5.4, 13.4), NIGHT, -0.3, 9.3, 0))
    .light(1.5, part(box(0.55, 0.22, 13.6), CYAN, -0.3, 12.05, 0), part(box(0.55, 0.22, 13.6), CYAN, -0.3, 6.55, 0));
  G.light(0.42, paint(place(new THREE.PlaneGeometry(12.6, 4.8), -0.02, 9.3, 0, 0, Math.PI / 2, 0), '#3b2a6b'));
  for (let i = 0; i < 3; i++) G.light(1.0, paint(place(new THREE.PlaneGeometry(6.2 - i * 1.4, 0.45), 0.0, 8.0 + i * 0.9, 2.6, 0, Math.PI / 2, 0), MAGENTA));
  G.light(1.4, paint(place(sparkleGeometry(2.1, 0.1, 5), 0.05, 9.4, -3.4, 0, Math.PI / 2, 0), WARM));
  return G.build();
}

/** Container gantry crane: four legs, a portal beam and an outreach boom over the water side (−X), red beacons. */
function harborCrane(): THREE.BufferGeometry {
  const O = '#e8622a', G = new GlowParts();
  for (const x of [-7, 7]) for (const z of [-5, 5]) G.add(part(box(1, 22, 1), O, x, 11, z, 0, 0, 0, 1, 1, 1, 0.04, 9));
  for (const z of [-5, 5]) G.add(part(box(15, 1.4, 1.2), O, 0, 22, z));
  G.add(part(box(1.2, 1.4, 11), O, -7, 22, 0), part(box(1.2, 1.4, 11), O, 7, 22, 0));
  G.add(part(box(40, 1.6, 2.6), '#d45a24', -8, 24, 0));
  G.add(paint(beam(0, 32, 0, -26, 24.8, 0, 0.5), O), paint(beam(0, 32, 0, 12, 24.8, 0, 0.5), O));
  G.add(part(box(1.2, 8, 1.2), O, 0, 28, 0));
  G.add(part(box(3.4, 2.4, 3.4), '#f1f1ea', -4, 22.2, 0));
  G.light(0.6, part(box(0.06, 1.0, 2.6), COOL, -2.28, 22.4, 0));
  for (const x of [-27, 11.5]) G.light(2.6, part(box(0.6, 0.6, 0.6), '#ff2a3a', x, 25.3, 0));
  G.light(2.4, part(sph(0.4, 6, 4), '#ff2a3a', 0, 32.6, 0));
  for (const x of [-7, 7]) for (let k = 0; k < 5; k++) G.add(part(box(1.02, 0.6, 1.02), k % 2 ? INK : '#f2c230', x, 0.3 + k * 0.6, -5), part(box(1.02, 0.6, 1.02), k % 2 ? INK : '#f2c230', x, 0.3 + k * 0.6, 5));
  return G.build();
}

/** Stacked shipping containers (2 × 3), ribbed doors, harbour colours. */
function containerStack(): THREE.BufferGeometry {
  const cols = ['#b8473a', '#2e7ea0', '#d49a2e', '#2f8a5a', '#6d4f96', '#c9ced6'];
  const R = rng(41), parts: THREE.BufferGeometry[] = [];
  for (let lv = 0; lv < 3; lv++) {
    for (let j = 0; j < 2; j++) {
      if (lv === 2 && j === 1) continue;
      const c = cols[Math.floor(R() * cols.length)]!, x = -1.3 - j * 2.7, y = lv * 2.75 + 1.35;
      parts.push(paint(place(box(2.45, 2.6, 12), x, y, (R() - 0.5) * 1.2), c, 0.03, lv * 7 + j));
      for (let r = -5; r <= 5; r += 1.25) parts.push(paint(place(box(2.55, 2.2, 0.12), x, y, r), c, 0.08, 3));
    }
  }
  return merge(parts);
}

/** Toll booth with a canopy and a light strip (the toll plaza on Skyway Interchange). */
function tollBooth(): THREE.BufferGeometry {
  return new GlowParts()
    .add(part(rbox(2.2, 2.8, 3.2, 0.2, 2), '#d9dde2', 0, 1.4, 0, 0, 0, 0, 1, 1, 1, 0.03, 3))
    .light(0.6, part(box(2.3, 0.9, 3.3), '#8fb8e8', 0, 2.2, 0))
    .add(part(box(2.8, 0.2, 3.6), '#2a2d36', 0, 2.95, 0))
    .add(part(box(1.2, 5.8, 1.2), CONCRETE, 0, 2.9, -8), part(box(1.2, 5.8, 1.2), CONCRETE, 0, 2.9, 8))
    .add(part(box(3.5, 0.9, 18), '#e8ebf0', 0, 6.2, 0))
    .light(1.6, part(box(3.6, 0.2, 18.2), CYAN, 0, 5.7, 0))
    .light(1.4, part(box(0.3, 1.2, 0.3), '#ff4fa3', 1.4, 0.6, 1.6))
    .build();
}

/** Strobing tunnel light bar (flickering neon). */
function strobeBar(): THREE.BufferGeometry {
  return merge([paint(place(box(0.35, 0.35, 5.5), 0, 5.2, 0), '#dff9ff'), paint(place(box(0.2, 5.2, 0.2), 0, 2.6, -2.6), '#dff9ff'), paint(place(box(0.2, 5.2, 0.2), 0, 2.6, 2.6), '#dff9ff')]);
}

/** Traffic car (F5 traffic hazard): rounded hatch, glowing tail and head lights; long axis along +Z. */
function car(): THREE.BufferGeometry {
  return merge([
    paint(place(rbox(1.9, 0.8, 4.2, 0.3, 2), 0, 0.65, 0), '#d8dce4', 0.03, 5),
    paint(place(rbox(1.7, 0.7, 2.3, 0.3, 2), 0, 1.35, -0.2), '#2a3346'),
    glow(paint(place(box(1.6, 0.18, 0.08), 0, 0.85, -2.12), '#ff2a3a'), 2),
    glow(paint(place(box(1.6, 0.16, 0.08), 0, 0.8, 2.12), '#fff3c4'), 2),
    ...[-1.4, 1.4].flatMap((z) => [-0.95, 0.95].map((x) => paint(place(cyl(0.34, 0.34, 0.25, 8), x, 0.34, z, 0, 0, Math.PI / 2), '#16181f'))),
  ]);
}

/** Metro car (F5 train hazard): 24 m, long axis along +Z, lit window band and magenta livery stripe. */
function metro(): THREE.BufferGeometry {
  const parts = [paint(place(rbox(3.2, 3.4, 24, 0.5, 2), 0, 2.0, 0), '#cfd4dc', 0.03, 8), paint(place(box(3.26, 0.35, 24.05), 0, 1.2, 0), MAGENTA)];
  for (let z = -10; z <= 10; z += 2.5) for (const sx of [1, -1]) parts.push(glow(paint(place(box(0.05, 0.9, 1.9), sx * 1.62, 2.6, z), WARM), 1.6));
  parts.push(glow(paint(place(box(2.4, 0.4, 0.05), 0, 1.6, 12.02), '#fff3c4'), 2.2));
  return merge(parts);
}

/** Deck support under elevated roads (compiler-placed): concrete column with a cyan neon collar. */
function pier(): THREE.BufferGeometry {
  return new GlowParts()
    .add(part(rbox(1.6, 6, 1.6, 0.2, 2), CONCRETE, 0, 3, 0, 0, 0, 0, 1, 1, 1, 0.04, 23), part(box(3.6, 0.6, 2.2), '#5d616d', 0, 5.8, 0))
    .light(1.2, part(box(1.7, 0.18, 1.7), CYAN, 0, 1.2, 0))
    .build();
}

/** Crash cushion at a split gore: water-filled barrels in harbour yellow with a reflective chevron board. */
function goreCushion(): THREE.BufferGeometry {
  const G = new GlowParts();
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) G.add(part(cyl(0.42, 0.45, 1.0, 8), i % 2 ? '#1c1f26' : '#ffd23f', (j - i / 2) * 0.9, 0.5, -i * 0.85));
  G.light(1.2, part(box(1.6, 0.7, 0.1), MAGENTA, 0, 1.4, 0.45));
  return G.build();
}

/** Subway station canopy with platform lights (subway platform on Skyway Interchange). */
function stationCanopy(): THREE.BufferGeometry {
  const G = new GlowParts().add(part(box(4, 0.5, 30), '#d9dde2', 0, 5.2, 0), part(box(4, 0.8, 30), CONCRETE, 0, 0.4, 0));
  for (let z = -12; z <= 12; z += 8) G.add(part(cyl(0.2, 0.2, 4.8, 6), STEEL, 1.4, 2.8, z));
  G.light(1.6, part(box(0.4, 0.12, 28), COOL, 1.2, 4.9, 0));
  G.light(0.8, part(box(0.2, 1.2, 3), '#2e86ab', 1.9, 4.2, 0));
  return G.build();
}

const F = (geometry: () => THREE.BufferGeometry, material: () => THREE.Material, castShadow = true, maxInstances?: number): PropFactory =>
  ({ build: () => ({ geometry: geometry(), material: material(), castShadow }), ...(maxInstances ? { maxInstances } : {}) });

export const NEON_PROPS: Record<string, PropFactory> = {
  // skyline and street blocks
  tower_a: F(towerA, city, false, 512),
  tower_b: F(towerB, city, false, 512),
  building_row_a: F(() => facade({ w: 20, d: 12, floors: 5, floorH: 3.3, tone: 0, seed: 101, sign: true, roof: 'tank' }), city, true, 256),
  building_row_b: F(() => facade({ w: 16, d: 12, floors: 8, floorH: 3.2, tone: 2, seed: 202, sign: false, roof: 'board' }), city, true, 256),
  building_row_c: F(() => facade({ w: 22, d: 14, floors: 3, floorH: 3.4, tone: 1, seed: 303, sign: true, roof: 'ac' }), city, true, 256),
  building_row_d: F(() => facade({ w: 18, d: 12, floors: 11, floorH: 3.2, tone: 3, seed: 404, sign: true, roof: 'ac' }), city, true, 256),
  shophouse: F(() => shophouse(7), city, true, 128),
  warehouse_building: F(warehouse, city, true, 64),
  // street furniture and ground cover (bush/crate/lamp names thin on Low/Medium)
  street_lamp: F(streetLamp, city, true, 256),
  traffic_signal: F(trafficSignal, city, true, 64),
  planter_bush: F(planter, lit, true, 1500),
  street_tree: F(streetTree, leafy, true, 800),
  street_bench: F(bench, lit, true, 600),
  vending_machine: F(vending, city, true, 200),
  bus_shelter: F(busShelter, city, true, 60),
  cargo_crate: F(crates, lit, true, 600),
  lantern_string: F(lanternString, city, false, 32),
  noodle_stall: F(noodleStall, city, true, 60),
  // racing furniture: neon sponsor boards, city flags, the start gantry
  ad_board_a: F(() => neonBoard('a'), city, true, 80),
  ad_board_b: F(() => neonBoard('b'), city, true, 80),
  ad_board_c: F(() => neonBoard('c'), city, true, 80),
  flag_pole: F(bannerPole, city, true, 200),
  gantry: F(neonGantry, city, true),
  // landmarks and hazards
  neon_sign: F(neonSign, city, true, 256),
  billboard: F(billboard, city, true, 128),
  harbor_crane: F(harborCrane, city, true, 32),
  container_stack: F(containerStack, metal, true, 256),
  toll_booth: F(tollBooth, city, true),
  strobe_bar: { build: () => ({ geometry: strobeBar(), material: MaterialLibrary.neon('#dff9ff', 4, 0.8) }) },
  station_canopy: F(stationCanopy, city, true),
  hazard_car: F(car, metal, true),
  hazard_train: F(metro, metal, true),
  pillar: F(pier, city, true),
  gore_cushion: F(goreCushion, city, true),
};

