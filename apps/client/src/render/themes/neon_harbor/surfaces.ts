// Theme surfaces for the night city and the orbital station (MaterialLibrary.custom, one material per parameter set):
//   ledBarrier — concrete or hull barrier with a segmented LED strip along the inner top edge, so the road edge reads
//                at night without lighting the whole scene (the strip stays under the bloom threshold);
//   paving     — world-space slabs for sidewalks, plazas and deck plating: one tone per slab, crisp joints, an
//                optional wet sheen; slopes (embankments under ramps) turn into a plain retaining-wall finish;
//   shopWall   — building walls (market street, the alley): brick-dark base with lit shop windows every 3 m.
// No per-pixel noise: variation comes from whole slabs and panels, which keeps the look organised.
import * as THREE from 'three/webgpu';
import { color, float, vec2, vec3, uv, positionWorld, mix, step, smoothstep, fract, floor, clamp, vertexColor, abs } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';
import { aaLines, cellRand, n01, setEmissive, slope01 } from '../../materials/tsl.ts';

type N = any;

/** vis wall uv: x ∈ {0, ⅓, ⅔, 1} across [inner bottom, inner top, outer top, outer bottom], y = s / 3. */
function wallFrame(): { U: N; inner: N; onTop: N; hFrac: N; innerFace: N } {
  const U = uv();
  const inner = U.x.mul(3);
  const onTop = step(0.98, inner).mul(step(U.x, 0.66));
  const hFrac = clamp(mix(inner, float(3).sub(U.x.mul(3)), step(0.66, U.x)), 0, 1);
  const innerFace = float(1).sub(step(1 / 3 + 0.002, U.x));
  return { U, inner, onTop, hFrac, innerFace };
}

export interface BarrierParams { body: string; base: string; cap: string; strip: string; gain: number; tint?: number; rough?: number; hazard?: string }

/** Barrier with a segmented LED strip (3 m segments) just under the cap on the road side; `hazard` paints the cap band as diagonal hazard stripes in that colour over the cap colour. */
export function ledBarrier(key: string, p: BarrierParams): THREE.Material {
  return MaterialLibrary.custom(`ledBarrier:${key}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: p.rough ?? 0.85 });
    const { U, onTop, hFrac, innerFace } = wallFrame();
    const seg = fract(U.y);
    const panel = cellRand(vec2(floor(U.y), 4.1)).mul(0.05).add(0.975);
    const seam = aaLines(U.y, 0.006);
    // dark kick band at the foot, concrete body, a cap band and the cap top
    const band = smoothstep(0.84, 0.86, hFrac).add(onTop);
    let c: N = mix(color(p.base), color(p.body).mul(panel), smoothstep(0.2, 0.24, hFrac));
    let cap: N = color(p.cap);
    if (p.hazard) cap = mix(cap, color(p.hazard), step(0.5, fract(U.y.mul(6).add(hFrac.mul(1.2)))));
    c = mix(c, cap, clamp(band, 0, 1)).mul(seam.mul(-0.35).add(1));
    const strip: N = smoothstep(0.7, 0.715, hFrac).mul(smoothstep(0.795, 0.78, hFrac)).mul(innerFace)
      .mul(step(0.03, seg)).mul(step(seg, 0.97));
    c = mix(c, color('#000000'), strip);
    m.colorNode = c.mul(vertexColor().rgb.div(p.tint ?? 1));
    m.roughnessNode = mix(float(p.rough ?? 0.85), float(0.5), clamp(band, 0, 1));
    setEmissive(m, color(p.strip).mul(strip.mul(p.gain)));
    return m;
  });
}

export interface PavingParams { a: string; b: string; joint: string; size: number; wall: string; wet?: number; lines?: string; rough?: number }

/** Slab paving in world xz (sidewalks, plazas, deck plates); `lines` adds a lit seam every 4th slab row. */
export function paving(key: string, p: PavingParams): THREE.Material {
  return MaterialLibrary.custom(`paving:${key}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: p.rough ?? 0.9 });
    const P = positionWorld;
    const g = P.xz.div(p.size);
    const cell = floor(g);
    const r = cellRand(cell);
    const joint = clamp(aaLines(g.x, 0.025).add(aaLines(g.y, 0.025)), 0, 1);
    let c: N = mix(color(p.a), color(p.b), step(0.55, r).mul(0.7).add(r.mul(0.3)));
    c = mix(c, color(p.joint), joint);
    // slopes (ramp embankments, deck sides) read as a plain retaining wall instead of stretched slabs
    const slope = smoothstep(0.25, 0.45, slope01());
    const courses = aaLines(P.y.mul(0.5), 0.02);
    c = mix(c, color(p.wall).mul(courses.mul(-0.3).add(1)), slope);
    let rough: N = float(p.rough ?? 0.9);
    if (p.wet) {
      // rain: shallow puddles in large, soft patches (low frequency, so no speckle), darker and mirror-smooth
      const puddle: N = smoothstep(0.56, 0.64, n01(vec2(P.x.mul(0.05), P.z.mul(0.05)))).mul(float(1).sub(slope));
      c = c.mul(mix(float(1), float(0.7), puddle.mul(p.wet)));
      rough = mix(mix(rough, float(0.45), p.wet), float(0.06), puddle.mul(p.wet));
    }
    m.colorNode = c.mul(vertexColor().rgb);
    m.roughnessNode = rough;
    if (p.lines) {
      // a lit seam every fourth plate row on the flat floor, and a lit band every 6 m up the plinth walls, so the
      // decks' supports read as structured bulkheads instead of dark mounds
      const row = abs(fract(g.y.mul(0.25)).sub(0.5)).mul(2);
      const lit: N = smoothstep(0.985, 0.995, row).mul(float(1).sub(slope));
      const band: N = aaLines(P.y.div(6), 0.015).mul(slope);
      setEmissive(m, color(p.lines).mul(lit.mul(0.8).add(band.mul(0.7))));
    }
    return m;
  });
}

export interface DeckRoadParams { a: string; b: string; seam: string; paint: string; glow: string; gain: number; tint?: readonly [number, number, number]; rough?: number }

/**
 * Station deck road: matte satin panels (one tone per 4 m panel and lane third), dark seams, a dashed centre line
 * and a lit guidance line just inside each edge (under the bloom threshold). Replaces the chrome tread plate,
 * which mirrored the black sky and read as a black, sparkling road. vis road uv: x across 0..1, y = s / 4.
 */
export function deckRoad(key: string, p: DeckRoadParams): THREE.Material {
  return MaterialLibrary.custom(`deckRoad:${key}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: p.rough ?? 0.62, metalness: 0.1 });
    const U = uv();
    const lane = floor(U.x.mul(3));
    const tone: N = cellRand(vec2(floor(U.y), lane)).mul(0.07).add(0.965);
    let c: N = mix(color(p.a), color(p.b), step(0.5, cellRand(vec2(floor(U.y), lane.add(5.3))))).mul(tone);
    const seams: N = clamp(aaLines(U.y, 0.01).add(aaLines(U.x.mul(3), 0.004).mul(step(0.05, U.x)).mul(step(U.x, 0.95))), 0, 1);
    c = mix(c, color(p.seam), seams.mul(0.8));
    const dash: N = smoothstep(0.012, 0.006, abs(U.x.sub(0.5))).mul(step(fract(U.y.mul(0.5)), 0.45));
    c = mix(c, color(p.paint), dash);
    const edge: N = smoothstep(0.018, 0.008, abs(U.x.sub(0.04))).add(smoothstep(0.018, 0.008, abs(U.x.sub(0.96))));
    c = mix(c, color('#000000'), clamp(edge, 0, 1));
    const vc: N = p.tint ? vertexColor().rgb.div(vec3(p.tint[0], p.tint[1], p.tint[2])) : vertexColor().rgb;
    m.colorNode = c.mul(vc);
    m.roughnessNode = mix(float(p.rough ?? 0.62), float(0.5), dash);
    setEmissive(m, color(p.glow).mul(clamp(edge, 0, 1).mul(p.gain)));
    return m;
  });
}

export interface ShopWallParams { body: string; trim: string; glass: string; gain: number; tint?: number }

/** Building wall: dark brick courses, a lit shop window per 3 m bay on the road side, a trim band on top. */
export function shopWall(key: string, p: ShopWallParams): THREE.Material {
  return MaterialLibrary.custom(`shopWall:${key}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88 });
    const { U, onTop, hFrac, innerFace } = wallFrame();
    const P = positionWorld;
    const bay = fract(U.y);
    const brick = clamp(aaLines(P.y.mul(4), 0.03), 0, 1);
    let c: N = color(p.body).mul(brick.mul(-0.25).add(1));
    const trim = clamp(smoothstep(0.86, 0.88, hFrac).add(onTop), 0, 1);
    c = mix(c, color(p.trim), trim);
    const win: N = smoothstep(0.24, 0.25, hFrac).mul(smoothstep(0.76, 0.75, hFrac)).mul(smoothstep(0.12, 0.14, bay)).mul(smoothstep(0.88, 0.86, bay)).mul(innerFace);
    const frame: N = smoothstep(0.2, 0.21, hFrac).mul(smoothstep(0.8, 0.79, hFrac)).mul(smoothstep(0.09, 0.1, bay)).mul(smoothstep(0.91, 0.9, bay)).mul(innerFace).sub(win);
    c = mix(c, color(p.trim).mul(0.6), clamp(frame, 0, 1));
    c = mix(c, color('#000000'), win);
    // every few bays the shutter is down (dark), so the run of windows has a rhythm instead of a solid band
    const open: N = step(0.3, cellRand(vec2(floor(U.y), 9.7)));
    m.colorNode = c.add(color('#2a2c34').mul(win.mul(float(1).sub(open)))).mul(vertexColor().rgb.div(p.tint ?? 1));
    m.roughnessNode = mix(float(0.88), float(0.2), win);
    setEmissive(m, color(p.glass).mul(win.mul(open).mul(p.gain)));
    return m;
  });
}
