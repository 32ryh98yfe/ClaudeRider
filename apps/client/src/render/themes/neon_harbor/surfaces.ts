// Theme surfaces for the night city and the orbital station (MaterialLibrary.custom, one material per parameter set):
//   ledBarrier — concrete or hull barrier with a segmented LED strip along the inner top edge, so the road edge reads
//                at night without lighting the whole scene (the strip stays under the bloom threshold);
//   paving     — world-space slabs for sidewalks, plazas and deck plating: one tone per slab, crisp joints, an
//                optional wet sheen; slopes (embankments under ramps) turn into a plain retaining-wall finish;
//   shopWall   — building walls (market street, the alley): brick-dark base with lit shop windows every 3 m.
// No per-pixel noise: variation comes from whole slabs and panels, which keeps the look organised.
import * as THREE from 'three/webgpu';
import { color, float, vec2, vec3, uv, positionWorld, normalWorld, mix, step, smoothstep, fract, floor, clamp, vertexColor, abs, dFdx, dFdy } from 'three/tsl';
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

/**
 * Keep-mask for the vis underside slot. trackc hangs each deck's side skirt down to the terrain, and where a deck
 * crosses a lower road the terrain is that road's ground, so the skirt became a 10 m curtain straight across the
 * lower road (Skyway's first-corner "black void": the karts drove through it). Skirt uv.x runs from 0 at the deck
 * edge to 1 at the skirt foot, and inside one triangle uv.x and the world position are both affine, so screen
 * derivatives give d(uv.x)/d(down) = 1 / skirt depth exactly; uv.x divided by that is the fragment's depth below the
 * deck edge. Skirt fragments deeper than `fascia` are dropped (their shadows too: maskShadowNode falls back to
 * maskNode), so an elevated deck reads as a slab with a fascia on its pillars. Contract request
 * S-C-skirts-over-roads asks trackc to stop the skirts above lower roads instead.
 */
export function fasciaMask(fascia: number): N {
  const P = positionWorld, u = uv().x;
  const px = dFdx(P), py = dFdy(P), ux = dFdx(u), uy = dFdy(u);
  const a = px.dot(px), b = px.dot(py), c = py.dot(py);
  const det = a.mul(c).sub(b.mul(b));
  // world-down (0, −1, 0) as α·px + β·py (least squares in the face plane), both weights scaled by det
  const al = b.mul(py.y).sub(c.mul(px.y)), be = b.mul(px.y).sub(a.mul(py.y));
  const duDown = al.mul(ux).add(be.mul(uy)); // det · du/d(down)
  const skirt = abs(normalWorld.y).lessThan(0.5).and(det.greaterThan(a.mul(c).mul(0.02))).and(duDown.greaterThan(0));
  return skirt.and(u.mul(det).greaterThan(duDown.mul(fascia))).not();
}

export interface BarrierParams { body: string; base: string; cap: string; strip: string; gain: number; tint?: number; rough?: number; hazard?: string; foot?: string; footGain?: number }

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
    const strip: N = smoothstep(0.72, 0.732, hFrac).mul(smoothstep(0.788, 0.776, hFrac)).mul(innerFace)
      .mul(step(0.03, seg)).mul(step(seg, 0.97));
    c = mix(c, color('#000000'), strip);
    // `foot`: a floor-edge LED line along the road at the barrier foot (guides the eye through underpasses)
    const foot: N = p.foot ? smoothstep(0.05, 0.06, hFrac).mul(smoothstep(0.1, 0.09, hFrac)).mul(innerFace) : float(0);
    c = mix(c, color('#000000'), foot);
    m.colorNode = c.mul(vertexColor().rgb.div(p.tint ?? 1));
    m.roughnessNode = mix(float(p.rough ?? 0.85), float(0.5), clamp(band, 0, 1));
    let glow: N = color(p.strip).mul(strip.mul(p.gain));
    if (p.foot) glow = glow.add(color(p.foot).mul(foot.mul(p.footGain ?? 0.8)));
    setEmissive(m, glow);
    return m;
  });
}

export interface PavingParams { a: string; b: string; joint: string; size: number; wall: string; wet?: number; lines?: string; rough?: number; band?: string; bandGain?: number }

/**
 * Slab paving in world xz (sidewalks, plazas, deck plates); `lines` adds a lit seam every 4th slab row. Slopes (the
 * embankments trackc raises under elevated decks) become a retaining wall of 4 m concrete panels with a coping
 * course every 6 m; `band` lights that course (a neon strip / hull light band), so a trench under the interchange
 * reads as built structure instead of a faceted mound.
 */
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
    const slope = smoothstep(0.1, 0.2, slope01()); // steeper than ≈ 28°
    const n = normalWorld;
    // vertical panel joints from whichever world axis runs along the wall (weighted by the wall's facing)
    const joints: N = clamp(aaLines(P.x.mul(0.25), 0.01).mul(abs(n.z)).add(aaLines(P.z.mul(0.25), 0.01).mul(abs(n.x))), 0, 1);
    const courses: N = aaLines(P.y.mul(0.5), 0.015);
    const coping: N = aaLines(P.y.div(6), 0.03);
    const panel: N = cellRand(vec2(floor(P.x.mul(0.25).add(P.z.mul(0.25))), floor(P.y.div(6)))).mul(0.08).add(0.96);
    let wallC: N = color(p.wall).mul(panel).mul(courses.mul(-0.18).add(1)).mul(joints.mul(-0.35).add(1));
    wallC = mix(wallC, color(p.wall).mul(1.25), coping);
    c = mix(c, wallC, slope);
    let rough: N = float(p.rough ?? 0.9);
    if (p.wet) {
      // rain: shallow puddles in large, soft patches (low frequency, so no speckle), darker and satin. A mirror
      // finish turned the moon and the back fill into hot white blobs on the plazas, so they stop at 0.24
      const puddle: N = smoothstep(0.56, 0.64, n01(vec2(P.x.mul(0.05), P.z.mul(0.05)))).mul(float(1).sub(slope));
      c = c.mul(mix(float(1), float(0.75), puddle.mul(p.wet)));
      rough = mix(mix(rough, float(0.5), p.wet), float(0.24), puddle.mul(p.wet));
    }
    m.colorNode = c.mul(vertexColor().rgb);
    m.roughnessNode = rough;
    let glowN: N = null;
    if (p.lines) {
      // a lit seam every fourth plate row on the flat floor
      const row = abs(fract(g.y.mul(0.25)).sub(0.5)).mul(2);
      glowN = color(p.lines).mul(smoothstep(0.985, 0.995, row).mul(float(1).sub(slope)).mul(0.8));
    }
    if (p.band) {
      const band: N = color(p.band).mul(aaLines(P.y.div(6).add(0.04), 0.012).mul(slope).mul(p.bandGain ?? 0.7));
      glowN = glowN ? glowN.add(band) : band;
    }
    if (glowN) setEmissive(m, glowN);
    return m;
  });
}

export interface UnderpassParams { a: string; b: string; light: string; gain: number; spacing?: number }

/**
 * Deck undersides (viaducts, the cloverleaf, the skyway): concrete with a grid of ceiling lights on the faces that
 * look down, so an underpass reads as a lit tunnel instead of a black hole (the decks block the key light).
 */
export function underpass(key: string, p: UnderpassParams): THREE.Material {
  return MaterialLibrary.custom(`underpass:${key}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88 });
    const P = positionWorld;
    m.colorNode = mix(color(p.a), color(p.b), n01(P.mul(0.3))).mul(vertexColor().rgb);
    const f: N = fract(P.xz.div(p.spacing ?? 7));
    const spot: N = smoothstep(0.4, 0.42, f.x).mul(smoothstep(0.6, 0.58, f.x)).mul(smoothstep(0.4, 0.42, f.y)).mul(smoothstep(0.6, 0.58, f.y));
    const down: N = smoothstep(-0.5, -0.8, normalWorld.y);
    setEmissive(m, color(p.light).mul(spot.mul(down).mul(p.gain)));
    m.maskNode = fasciaMask(1.5);
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
