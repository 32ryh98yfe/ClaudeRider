// World materials v1 (30-art-bible.md §5): road variants, kerbs, walls by type, terrain, water, foliage, pads.
// All node graphs are built once per parameter set and memoized by library.ts.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, uv, positionWorld, positionLocal, normalWorld, time, mix, step, smoothstep, fract, abs, floor, mod,
  clamp, vertexColor, max, min, sin, cos, hash, instanceIndex, triplanarTexture, texture, length,
} from 'three/tsl';
import { fbm2, n01, cellEdges, proceduralBump, aaLines, detailFade, windOffset, slope01, chevrons, cellRand, fxUniforms, fresnel } from './tsl.ts';

type N = any;

export type RoadStyle = 'asphalt' | 'cobble' | 'dirt' | 'ice' | 'metal' | 'wood' | 'sand' | 'neon' | 'glass' | 'snow' | 'gravel' | 'lava' | 'basalt' | 'obsidian' | 'conveyor';
/**
 * `shoulder`: no paint or wheel wear (off-road strips use the same surface looks).
 * `tint`: the vertex tint trackc bakes into this surface's colours (.vis v2), divided out so only the AO remains.
 * `dir`: conveyor scroll direction (+1 forward, −1 back).
 */
export interface RoadParams { style: RoadStyle; a: string; b: string; line: string; wet?: boolean; glow?: string; shoulder?: boolean; tint?: readonly [number, number, number]; dir?: number }
export type WallStyle = 'panel' | 'stone' | 'barrier' | 'fence' | 'rock' | 'parapet' | 'building' | 'planter' | 'pillar' | 'curb' | 'glass' | 'neon' | 'ice' | 'hedge';
export interface WaterParams { shallow: string; deep: string; foam?: string; opacity?: number; waveScale?: number }

/** Quality profile the node graphs specialise on (set by the RaceRenderer from the tier). */
export interface MaterialProfile { hq: boolean; triplanar: boolean }

// ----------------------------------------------------------------------------------------------- roads
const ROUGH: Record<RoadStyle, number> = { asphalt: 0.86, cobble: 0.78, dirt: 0.95, ice: 0.18, metal: 0.4, wood: 0.72, sand: 0.97, neon: 0.35, glass: 0.12, snow: 0.8, gravel: 0.95, lava: 0.6, basalt: 0.82, obsidian: 0.18, conveyor: 0.5 };
const METAL: Partial<Record<RoadStyle, number>> = { metal: 0.65, neon: 0.2, glass: 0.1, obsidian: 0.15, conveyor: 0.5 };
const PAINT: Record<RoadStyle, number> = { asphalt: 1, cobble: 0.5, dirt: 0, ice: 0.45, metal: 0.9, wood: 0.35, sand: 0, neon: 0, glass: 0.6, snow: 0, gravel: 0, lava: 0, basalt: 0.4, obsidian: 0.3, conveyor: 0 };

export function buildRoad(p: RoadParams, prof: MaterialProfile): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: ROUGH[p.style], metalness: METAL[p.style] ?? 0 });
  const U = uv(), P = positionWorld;
  const A = color(p.a), B = color(p.b);
  const macro = n01(P.xz.mul(0.045));
  const speck = n01(P.xz.mul(2.1));
  let base: N = mix(A, B, speck.mul(0.5).add(macro.mul(0.5)));
  let rough: N = float(ROUGH[p.style]);
  let height: N = null;
  let emissive: N = null;
  // racing-line wear: two slightly polished darker bands where the wheels run
  const wear = p.shoulder ? float(0) : smoothstep(0.13, 0.0, abs(U.x.sub(0.3))).add(smoothstep(0.13, 0.0, abs(U.x.sub(0.7))));
  switch (p.style) {
    case 'asphalt': {
      base = base.mul(wear.mul(-0.09).add(1));
      rough = rough.sub(wear.mul(0.1));
      if (prof.hq) {
        const patch = smoothstep(0.78, 0.8, n01(P.xz.mul(0.09).add(3.1)));
        base = mix(base, base.mul(0.82), patch.mul(0.8));
        const grit = n01(P.xz.mul(9.0));
        rough = rough.add(grit.sub(0.5).mul(0.12));
        height = speck.mul(0.55).add(grit.mul(0.45));
      }
      break;
    }
    case 'cobble': {
      const g = vec2(U.x.mul(22), U.y.mul(2.6));
      const row = floor(g.y);
      const gx = fract(g.x.add(mod(row, 2).mul(0.5))), gy = fract(g.y);
      const cell = vec2(floor(g.x.add(mod(row, 2).mul(0.5))), row);
      const rnd = cellRand(cell);
      const ex = abs(gx.sub(0.5)).mul(2), ey = abs(gy.sub(0.5)).mul(2);
      const dome = float(1).sub(max(ex.mul(ex), ey.mul(ey)));
      const mortar = smoothstep(0.0, 0.12, dome);
      base = mix(base.mul(0.55), base.mul(rnd.mul(0.3).add(0.85)), mortar);
      rough = mix(float(0.97), float(0.7).add(rnd.mul(0.12)), mortar);
      height = dome.mul(mortar);
      break;
    }
    case 'wood': {
      const pv = U.y.mul(3);
      const plank = floor(pv), f = fract(pv);
      const rnd = cellRand(vec2(plank, 3.7));
      const seam = smoothstep(0.0, 0.05, f).mul(smoothstep(1.0, 0.95, f));
      const grain = n01(vec2(U.x.mul(3.0).add(rnd.mul(9)), pv.mul(16)));
      base = base.mul(rnd.mul(0.28).add(0.82)).mul(grain.mul(0.25).add(0.85)).mul(seam.mul(0.4).add(0.6));
      const nail = smoothstep(0.03, 0.0, length(vec2(fract(U.x.mul(4)).sub(0.5).mul(0.25), f.sub(0.5).mul(0.75))));
      base = mix(base, color('#2e2a26'), nail.mul(0.8));
      rough = mix(float(0.9), float(0.68), seam);
      height = seam.mul(grain.mul(0.3).add(0.7));
      break;
    }
    case 'dirt': {
      const ruts = smoothstep(0.1, 0.0, abs(U.x.sub(0.3))).add(smoothstep(0.1, 0.0, abs(U.x.sub(0.7))));
      const pebbles = float(1).sub(cellEdges(P.xz.mul(3.2), 0.18));
      base = base.mul(ruts.mul(-0.16).add(1)).add(pebbles.mul(0.05));
      height = speck.mul(0.6).add(pebbles.mul(0.4)).sub(ruts.mul(0.3));
      break;
    }
    case 'sand': {
      const warp = n01(P.xz.mul(0.25)).mul(4);
      const ripple = sin(P.x.mul(1.3).add(P.z.mul(0.6)).add(warp)).mul(0.5).add(0.5);
      base = base.mul(ripple.mul(0.08).add(0.96)).mul(wear.mul(-0.06).add(1));
      height = ripple.mul(0.7).add(speck.mul(0.3));
      break;
    }
    case 'snow': {
      const packed = wear.mul(0.35);
      base = mix(base, base.mul(0.8), packed);
      rough = mix(float(0.85), float(0.45), packed);
      height = speck;
      break;
    }
    case 'ice': {
      const crack = float(1).sub(cellEdges(P.xz.mul(0.32), 0.06));
      const frost = n01(P.xz.mul(0.5));
      base = mix(base, color('#ffffff'), crack.mul(0.35).add(frost.mul(0.12)));
      rough = float(0.1).add(frost.mul(0.25)).add(crack.mul(0.3));
      height = crack.mul(-1).add(frost.mul(0.3));
      break;
    }
    case 'metal': {
      // diamond tread plate + panel seams every 4 m
      const q = vec2(P.x.add(P.z), P.x.sub(P.z)).mul(2.4);
      const bx = abs(fract(q.x).sub(0.5)), by = abs(fract(q.y).sub(0.5));
      const tread = smoothstep(0.18, 0.08, abs(bx.sub(by)).add(max(bx, by).mul(0.35)));
      const seam = aaLines(U.y.mul(1), 0.012);
      base = base.mul(tread.mul(0.18).add(0.9)).mul(seam.mul(-0.45).add(1));
      rough = float(0.42).sub(tread.mul(0.12)).add(seam.mul(0.3));
      height = tread;
      break;
    }
    case 'neon': {
      const glow = color(p.glow ?? p.line);
      const lu = aaLines(U.x.mul(8), 0.02), lv = aaLines(U.y.mul(4), 0.015);
      const grid = clamp(lu.add(lv), 0, 1);
      const pulse = smoothstep(0.9, 1.0, fract(U.y.mul(0.25).sub(time.mul(0.6).mul(fxUniforms.pulse))));
      base = mix(base, base.mul(1.6), grid);
      emissive = glow.mul(grid.mul(pulse.mul(2.5).add(1.2)));
      rough = mix(float(0.3), float(0.55), speck);
      break;
    }
    case 'gravel': {
      const stones = float(1).sub(cellEdges(P.xz.mul(6.5), 0.25));
      const tone = n01(P.xz.mul(4.1));
      base = base.mul(stones.mul(0.22).add(0.86)).mul(tone.mul(0.16).add(0.9));
      height = stones.mul(0.7).add(tone.mul(0.3));
      break;
    }
    case 'basalt': {
      const cracks = float(1).sub(cellEdges(P.xz.mul(0.7), 0.05));
      base = base.mul(cracks.mul(-0.35).add(1)).mul(speck.mul(0.12).add(0.92));
      emissive = color('#ff6a2b').mul(cracks.mul(smoothstep(0.55, 0.7, n01(P.xz.mul(0.05)))).mul(0.8));
      height = cracks.mul(-1);
      break;
    }
    case 'obsidian': {
      const facets = cellEdges(P.xz.mul(0.4), 0.12);
      base = base.mul(facets.mul(0.25).add(0.8)).add(fresnel(4).mul(0.15));
      rough = float(0.12).add(facets.oneMinus().mul(0.25));
      break;
    }
    case 'lava': {
      // cooled crust plates over glowing flow: the crust drifts slowly, the glow pulses
      const flow = n01(vec2(P.x.mul(0.18).add(time.mul(0.05)), P.z.mul(0.18)));
      const crust = smoothstep(0.35, 0.55, cellEdges(P.xz.mul(0.35).add(vec2(time.mul(0.03), 0)), 0.4).mul(flow.add(0.4)));
      base = mix(color('#ff6a2b'), color('#2b1a14'), crust);
      emissive = mix(color('#ffb347').mul(2.4), color('#ff4a1b').mul(0.6), crust).mul(float(1).sub(crust.mul(0.92))).mul(sin(time.mul(1.7).add(flow.mul(6))).mul(0.15).add(1));
      rough = mix(float(0.4), float(0.9), crust);
      break;
    }
    case 'conveyor': {
      // metal belt with chevrons scrolling in the belt direction
      const d = p.dir ?? 1;
      const slat = aaLines(U.y.mul(2).sub(time.mul(1.6 * d)), 0.03);
      const chev = fract(U.y.mul(0.5).sub(time.mul(0.8 * d)).add(abs(U.x.sub(0.5)).mul(d > 0 ? 1.2 : -1.2)));
      const arrow = smoothstep(0.5, 0.55, chev).mul(smoothstep(0.75, 0.7, chev));
      base = base.mul(slat.mul(-0.35).add(1));
      emissive = color(p.glow ?? (d > 0 ? '#3EE6C8' : '#FF9A5A')).mul(arrow.mul(0.9));
      rough = float(0.45).add(slat.mul(0.2));
      break;
    }
    case 'glass': {
      const lu = aaLines(U.x.mul(4), 0.01), lv = aaLines(U.y.mul(1.5), 0.01);
      const edges = clamp(lu.add(lv), 0, 1);
      base = mix(base, color(p.line), edges.mul(0.6)).add(fresnel(3).mul(0.1));
      emissive = color(p.glow ?? p.line).mul(edges.mul(0.6));
      break;
    }
  }
  // painted edge lines + dashed centre line (in shader, 30-art-bible §5)
  const edge = aaLines(U.x.sub(0.03).mul(1), 0.012).mul(step(U.x, 0.06)).add(aaLines(U.x.sub(0.97), 0.012).mul(step(0.94, U.x)));
  const dash = smoothstep(0.009, 0.004, abs(U.x.sub(0.5))).mul(step(fract(U.y.mul(0.5)), 0.45)).mul(p.style === 'asphalt' ? 0.85 : 0.5);
  const paint = clamp(edge.add(dash), 0, 1).mul(p.shoulder ? 0 : PAINT[p.style]);
  const worn = prof.hq ? n01(P.xz.mul(1.3)).mul(0.35).add(0.65) : float(1);
  const paintK = paint.mul(worn);
  let col: N = mix(base, color(p.line), paintK);
  rough = mix(rough, float(0.55), paintK);
  if (p.wet) {
    // puddles: darker albedo and mirror-smooth where the noise pools
    const puddle = smoothstep(0.55, 0.62, n01(P.xz.mul(0.12)));
    col = col.mul(mix(float(0.72), float(0.55), puddle));
    rough = mix(float(0.28), float(0.04), puddle);
  } else {
    col = col.mul(fxUniforms.wet.mul(-0.3).add(1));
    rough = mix(rough, float(0.2), fxUniforms.wet);
  }
  // vertex colour = baked AO (× the trackc surface tint in .vis v2, divided out when known)
  const vc: N = p.tint ? vertexColor().rgb.div(vec3(p.tint[0], p.tint[1], p.tint[2])) : vertexColor();
  m.colorNode = col.mul(vc);
  m.roughnessNode = clamp(rough, 0.03, 1);
  if (height && prof.hq) m.normalNode = proceduralBump(height, detailFade(4, 40).mul(0.06));
  if (emissive) m.emissiveNode = emissive;
  return m;
}

// ----------------------------------------------------------------------------------------------- kerbs
export function buildKerb(a: string, b: string, prof: MaterialProfile): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const U = uv();
  const stripe = step(0.5, fract(U.y));
  const crest = sin(U.x.mul(Math.PI)).mul(0.12).add(0.9);
  let c: N = mix(color(a), color(b), stripe).mul(crest);
  if (prof.hq) c = c.mul(n01(positionWorld.xz.mul(1.7)).mul(0.14).add(0.9));
  m.colorNode = c.mul(vertexColor());
  m.roughnessNode = mix(float(0.62), float(0.48), stripe);
  return m;
}

// ----------------------------------------------------------------------------------------------- walls
/** vis wall slot uv: x ∈ {0, 1/3, 2/3, 1} across [inner bottom, inner top, outer top, outer bottom]; y = s/3. */
export function buildWall(kind: WallStyle, a: string, b: string, prof: MaterialProfile, tint = 1): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.72 });
  const U = uv(), P = positionWorld;
  const inner = U.x.mul(3);                                // 0..1 up the inner face
  const onTop = step(0.98, inner).mul(step(U.x, 0.66));
  const hFrac = clamp(mix(inner, float(3).sub(U.x.mul(3)), step(0.66, U.x)), 0, 1);
  const A = color(a), B = color(b);
  const grime = smoothstep(0.35, 0.0, hFrac).mul(0.28);  // road dirt splashed on the bottom
  let c: N; let rough: N; let height: N = null; let emissive: N = null;
  switch (kind) {
    case 'stone': case 'parapet': {
      const course = fract(P.y.mul(2.5));
      const row = floor(P.y.mul(2.5));
      const along = fract(U.y.mul(1.2).add(mod(row, 2).mul(0.5)));
      const block = cellRand(vec2(floor(U.y.mul(1.2).add(mod(row, 2).mul(0.5))), row));
      const joint = smoothstep(0.0, 0.07, course).mul(smoothstep(0.0, 0.04, along)).mul(smoothstep(1.0, 0.96, along));
      c = mix(A, B, n01(P.mul(0.9)).mul(0.6).add(block.mul(0.4))).mul(joint.mul(0.3).add(0.7));
      c = mix(c, A.mul(1.12), onTop);
      rough = mix(float(0.95), float(0.78), joint);
      height = joint.mul(block.mul(0.3).add(0.7));
      break;
    }
    case 'rock': {
      const strata = sin(P.y.mul(3.1).add(n01(P.mul(0.35)).mul(5))).mul(0.5).add(0.5);
      c = mix(A, B, fbm2(P.mul(0.6)).mul(0.7).add(strata.mul(0.3)));
      rough = float(0.92);
      height = fbm2(P.mul(1.4));
      break;
    }
    case 'fence': {
      const board = fract(U.y.mul(5));
      const gap = smoothstep(0.0, 0.08, board).mul(smoothstep(1.0, 0.92, board));
      const tone = cellRand(vec2(floor(U.y.mul(5)), 1.3));
      c = mix(A.mul(0.35), mix(A, B, tone.mul(0.6)), gap).mul(n01(vec2(U.y.mul(5), P.y.mul(12))).mul(0.2).add(0.85));
      rough = float(0.85);
      height = gap;
      break;
    }
    case 'building': {
      const trim = smoothstep(0.8, 0.84, hFrac);
      c = mix(A.mul(n01(P.mul(1.3)).mul(0.1).add(0.92)), B, trim.add(onTop));
      rough = float(0.88);
      break;
    }
    case 'planter': case 'hedge': {
      const leaf = step(0.55, hFrac).add(onTop);
      const leafC = color('#4f8a3a').mul(fbm2(P.mul(2.2)).mul(0.45).add(0.7));
      const brick = aaLines(P.y.mul(4), 0.03).add(aaLines(U.y.mul(2).add(floor(P.y.mul(4)).mul(0.5)), 0.02));
      c = mix(A.mul(clamp(brick, 0, 1).mul(-0.35).add(1)), kind === 'hedge' ? leafC : mix(leafC, B, 0.2), clamp(leaf, 0, 1));
      rough = float(0.9);
      height = mix(float(0), fbm2(P.mul(3)), clamp(leaf, 0, 1));
      break;
    }
    case 'pillar': {
      const groove = aaLines(U.y.mul(3), 0.03);
      c = mix(A, B, n01(P.mul(0.8)).mul(0.4)).mul(groove.mul(-0.3).add(1));
      rough = float(0.8);
      break;
    }
    case 'glass': {
      const frame = aaLines(U.y.mul(0.5), 0.02).add(smoothstep(0.9, 0.95, hFrac)).add(onTop);
      c = mix(A.mul(0.35), B, clamp(frame, 0, 1)).add(fresnel(3).mul(0.25));
      rough = mix(float(0.05), float(0.4), clamp(frame, 0, 1));
      emissive = B.mul(clamp(frame, 0, 1).mul(0.9));
      m.metalness = 0.3;
      break;
    }
    case 'neon': {
      const strip = smoothstep(0.03, 0.0, abs(hFrac.sub(0.72))).add(onTop.mul(0.6));
      c = A.mul(n01(P.mul(0.7)).mul(0.25).add(0.8));
      emissive = B.mul(clamp(strip, 0, 1).mul(3.2).mul(sin(U.y.mul(0.8).sub(time.mul(2))).mul(0.25).add(0.85)));
      rough = float(0.4);
      break;
    }
    case 'ice': {
      const crack = float(1).sub(cellEdges(P.mul(0.6), 0.05));
      c = mix(A, B, n01(P.mul(0.4))).add(crack.mul(0.25)).add(fresnel(2).mul(0.2));
      rough = float(0.15).add(crack.mul(0.3));
      m.metalness = 0.05;
      break;
    }
    case 'panel': case 'barrier': case 'curb': default: {
      // painted safety barrier: alternating 3 m panels, coloured top band, bolt heads, splash grime
      const panelIdx = floor(U.y.mul(1));
      const alt = mod(panelIdx, 2);
      const seam = aaLines(U.y.mul(1), 0.012);
      const band = smoothstep(0.78, 0.8, hFrac).add(onTop);
      c = mix(mix(A, B, alt), B, clamp(band, 0, 1)).mul(seam.mul(-0.4).add(1));
      const bolts = smoothstep(0.05, 0.0, length(vec2(fract(U.y.mul(1)).sub(0.08), hFrac.sub(0.5)).mul(vec2(3, 1))));
      c = mix(c, color('#9a9aa0'), bolts);
      rough = mix(float(0.62), float(0.45), clamp(band, 0, 1));
      break;
    }
  }
  c = c.mul(float(1).sub(grime));
  m.colorNode = c.mul(tint !== 1 ? vertexColor().rgb.div(tint) : vertexColor());
  m.roughnessNode = rough;
  if (emissive) m.emissiveNode = emissive;
  if (height && prof.hq) m.normalNode = proceduralBump(height, detailFade(3, 30).mul(0.05));
  return m;
}

// ----------------------------------------------------------------------------------------------- terrain
let detailTex: THREE.DataTexture | null = null;
/** 128² tileable value-noise detail texture (triplanar rock/soil detail on High). */
function terrainDetailTexture(): THREE.DataTexture {
  if (detailTex) return detailTex;
  const S = 128, data = new Uint8Array(S * S * 4);
  const lattice = new Float32Array(16 * 16);
  let seed = 1337;
  for (let i = 0; i < lattice.length; i++) { seed = (seed * 16807) % 2147483647; lattice[i] = seed / 2147483647; }
  const L = (x: number, y: number): number => lattice[((y & 15) << 4) | (x & 15)]!;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.5;
    const f = 16 / S;
    for (let o = 0; o < 4; o++) {
      const fx = x * f * (1 << o), fy = y * f * (1 << o);
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = L(ix, iy) + (L(ix + 1, iy) - L(ix, iy)) * sx, b = L(ix, iy + 1) + (L(ix + 1, iy + 1) - L(ix, iy + 1)) * sx;
      v += (a + (b - a) * sy) * amp; amp *= 0.5;
    }
    const g = Math.max(0, Math.min(255, Math.round(v * 270)));
    const o4 = (y * S + x) * 4;
    data[o4] = data[o4 + 1] = data[o4 + 2] = g; data[o4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  detailTex = t;
  return t;
}

export function buildTerrain(a: string, b: string, rock: string, prof: MaterialProfile): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const P = positionWorld;
  const n1 = n01(P.xz.mul(0.018)), n2 = n01(P.xz.mul(0.21));
  const slope = clamp(slope01().mul(3.2), 0, 1);
  let grass: N = mix(color(a), color(b), n1.mul(0.7).add(n2.mul(0.3)));
  // sun-dried patches and darker clover clumps break up the flat green
  const dry = smoothstep(0.62, 0.8, n01(P.xz.mul(0.035).add(9.1)));
  grass = mix(grass, grass.mul(vec3(1.18, 1.08, 0.72)), dry.mul(0.55));
  let rockC: N = color(rock).mul(n2.mul(0.25).add(0.85));
  if (prof.hq) {
    const fine = n01(P.xz.mul(1.9));
    grass = grass.mul(fine.mul(0.16).mul(detailFade(6, 60)).add(0.92));
    const strata = sin(P.y.mul(2.2).add(n2.mul(3))).mul(0.5).add(0.5);
    rockC = rockC.mul(strata.mul(0.18).add(0.86));
  }
  if (prof.triplanar) {
    const d = triplanarTexture(texture(terrainDetailTexture()), null, null, float(0.18), positionWorld, normalWorld).r;
    rockC = rockC.mul(d.mul(0.55).add(0.7));
    grass = grass.mul(d.mul(0.2).add(0.9));
  }
  m.colorNode = mix(grass, rockC, slope).mul(vertexColor());
  m.roughnessNode = mix(float(0.96), float(0.85), slope);
  if (prof.hq) m.normalNode = proceduralBump(n2.mul(0.6).add(slope.mul(n01(P.mul(0.9)))), detailFade(5, 70).mul(0.25));
  return m;
}

// ----------------------------------------------------------------------------------------------- water
/** Stylized water: Fresnel deep→shallow tint, two scrolling normal octaves, crest foam, PMREM reflections. */
export function buildWater(p: WaterParams, prof: MaterialProfile): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.0, transparent: (p.opacity ?? 0.88) < 1 });
  const P = positionWorld;
  const s = p.waveScale ?? 1;
  const t = time.mul(0.35);
  const w1 = n01(vec2(P.x.mul(0.12 * s).add(t), P.z.mul(0.12 * s).sub(t.mul(0.7))));
  const w2 = n01(vec2(P.x.mul(0.45 * s).sub(t.mul(1.3)), P.z.mul(0.45 * s).add(t.mul(0.9))));
  const h = w1.mul(0.7).add(w2.mul(0.3));
  const fr = fresnel(4);
  const foam = smoothstep(0.72, 0.8, h).mul(0.7);
  m.colorNode = mix(mix(color(p.deep), color(p.shallow), h.mul(0.6).add(fr.mul(0.4))), color(p.foam ?? '#ffffff'), foam);
  m.roughnessNode = mix(float(0.04), float(0.35), foam);
  m.opacity = p.opacity ?? 0.88;
  m.normalNode = proceduralBump(h, float(prof.hq ? 0.5 : 0.3));
  return m;
}

// ----------------------------------------------------------------------------------------------- foliage
/** Colour-noise foliage with wind in positionNode (amplitude 0.08 · heightMask, 30-art-bible §5). */
export function buildFoliage(a: string, b: string, vertexColored: boolean): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  const n = n01(positionWorld.mul(0.5));
  m.colorNode = vertexColored ? vertexColor().mul(n.mul(0.2).add(0.9)) : mix(color(a), color(b), n).mul(vertexColor());
  const phase = hash(instanceIndex).mul(6.283);
  const mask = smoothstep(1.4, 5.0, positionLocal.y).mul(positionLocal.y.mul(0.25).min(1.5));
  m.positionNode = positionLocal.add(windOffset(phase, mask));
  return m;
}

// ----------------------------------------------------------------------------------------------- gameplay surfaces
/** Boost pads (vertex colour r = 1: teal chevrons) and jump pads (r = 0: coral with pink), 30-art-bible §11. */
export function buildPad(kind: 'auto' | 'boost' | 'jump' = 'auto'): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3 });
  const U = uv();
  // v1 .vis marks the kind in vertex colour r; v2 names it in the slot variant
  const isBoost: N = kind === 'boost' ? float(1) : kind === 'jump' ? float(0) : step(0.5, vertexColor().r);
  const on = chevrons(U.x, U.y, 4, 2.2);
  const edge = smoothstep(0.5, 0.44, abs(U.x.sub(0.5)));
  const rim = smoothstep(0.4, 0.5, abs(U.x.sub(0.5)));
  const boostBase = mix(color('#0b6e5f'), color('#aaffea'), on), boostGlow = mix(color('#1FB5A0'), color('#3EE6C8'), on);
  const jumpBase = mix(color('#a8412c'), color('#ffd0c2'), on), jumpGlow = mix(color('#FF7A59'), color('#FF9EC7'), on);
  m.colorNode = mix(jumpBase, boostBase, isBoost).mul(edge.mul(0.8).add(0.2));
  m.emissiveNode = mix(jumpGlow, boostGlow, isBoost).mul(on.mul(2.2).add(0.35).mul(edge).add(rim.mul(1.4)));
  return m;
}

/** F2 kill planes: `lava` = glowing molten surface (emissive, bloom); `void` = dark abyss with a faint glowing rim. */
export function buildKillPlane(kind: 'lava' | 'void'): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: kind === 'lava' ? 0.6 : 1 });
  const P = positionWorld;
  if (kind === 'lava') {
    const flow = n01(vec2(P.x.mul(0.06).add(time.mul(0.04)), P.z.mul(0.06)));
    const crust = smoothstep(0.3, 0.6, cellEdges(P.xz.mul(0.12).add(vec2(time.mul(0.02), time.mul(0.01))), 0.45).mul(flow.add(0.3)));
    m.colorNode = mix(color('#ff6a2b'), color('#261510'), crust);
    m.emissiveNode = mix(color('#ffc857').mul(3), color('#ff4a1b').mul(0.4), crust).mul(float(1).sub(crust.mul(0.9)));
  } else {
    const n = n01(P.xz.mul(0.02).add(time.mul(0.01)));
    m.colorNode = color('#07060c').mul(n.mul(0.4).add(0.6));
    m.emissiveNode = color('#6A4C93').mul(smoothstep(0.7, 0.9, n).mul(0.25));
  }
  return m;
}

export function buildStartLine(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  const U = uv();
  const ch = mod(floor(U.x.mul(18)).add(floor(U.y.mul(3))), 2);
  m.colorNode = mix(color('#141413'), color('#faf9f5'), ch);
  m.roughnessNode = mix(float(0.8), float(0.55), ch);
  return m;
}

/** Stylized world material (low-frequency noise albedo + optional vertex AO). */
export function buildWorld(p: { color: string; color2?: string; roughness: number; metalness?: number; noiseScale?: number; vertexAO?: boolean }): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: p.roughness, metalness: p.metalness ?? 0 });
  const n = n01(positionWorld.mul(p.noiseScale ?? 0.15));
  const c = mix(color(p.color), color(p.color2 ?? p.color), n);
  m.colorNode = p.vertexAO ? c.mul(vertexColor().rgb) : c;
  return m;
}

export { min, cos };
