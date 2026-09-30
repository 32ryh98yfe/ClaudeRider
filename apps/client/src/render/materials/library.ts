// MaterialLibrary — the ONLY shared TSL surface (ADR-011, CLAUDE.md rule 6). ≤ 40 unique materials per scene.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, uv, positionWorld, normalWorld, normalView, positionViewDirection, time, mix, step, smoothstep, fract,
  abs, floor, mod, clamp, uniform, mx_noise_float, vertexColor, dot, pow, max, sin, Fn,
} from 'three/tsl';

export type RoadStyle = 'asphalt' | 'cobble' | 'dirt' | 'ice' | 'metal' | 'wood' | 'sand';
export interface RoadParams { style: RoadStyle; a: string; b: string; line: string }
export interface MascotPalette { body: THREE.Color; shade: THREE.Color; accent: THREE.Color; detail: THREE.Color; eye: THREE.Color }

const cache = new Map<string, THREE.Material>();
const keyOf = (kind: string, p: unknown): string => `${kind}:${JSON.stringify(p)}`;

function memo<T extends THREE.Material>(k: string, make: () => T): T {
  let m = cache.get(k) as T | undefined;
  if (!m) { m = make(); m.name = k; cache.set(k, m); }
  return m;
}

/** Stylized world material (low-frequency noise albedo + vertex AO). */
function world(p: { color: string; color2?: string; roughness: number; metalness?: number; noiseScale?: number; vertexAO?: boolean }): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('world', p), () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: p.roughness, metalness: p.metalness ?? 0 });
    const n = mx_noise_float(positionWorld.mul(p.noiseScale ?? 0.15)).mul(0.5).add(0.5);
    const c = mix(color(p.color), color(p.color2 ?? p.color), n);
    m.colorNode = p.vertexAO ? c.mul(vertexColor().rgb) : c;
    return m;
  });
}

function road(p: RoadParams): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('road', p), () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: p.style === 'ice' ? 0.25 : p.style === 'metal' ? 0.45 : 0.86, metalness: p.style === 'metal' ? 0.5 : 0 });
    const U = uv();
    const speck = mx_noise_float(positionWorld.xz.mul(1.7)).mul(0.5).add(0.5);
    const blotch = mx_noise_float(positionWorld.xz.mul(0.06)).mul(0.5).add(0.5);
    let base = mix(color(p.a), color(p.b), speck.mul(0.55).add(blotch.mul(0.45)));
    if (p.style === 'cobble') {
      // staggered stone tiles with darker mortar
      const g = vec2(U.x.mul(22), U.y.mul(2.4));
      const row = floor(g.y);
      const gx = fract(g.x.add(mod(row, 2).mul(0.5)));
      const gy = fract(g.y);
      const mortar = smoothstep(0.0, 0.08, gx).mul(smoothstep(1.0, 0.92, gx)).mul(smoothstep(0.0, 0.1, gy)).mul(smoothstep(1.0, 0.9, gy));
      const tileVar = mx_noise_float(vec3(floor(g.x.add(mod(row, 2).mul(0.5))), row, 0.5)).mul(0.12);
      base = base.mul(mortar.mul(0.35).add(0.65)).add(tileVar);
    } else if (p.style === 'wood') {
      const plank = fract(U.y.mul(3));
      base = base.mul(smoothstep(0.0, 0.05, plank).mul(0.25).add(0.75));
    } else if (p.style === 'dirt' || p.style === 'sand') {
      const ruts = smoothstep(0.08, 0.0, abs(U.x.sub(0.3))).add(smoothstep(0.08, 0.0, abs(U.x.sub(0.7))));
      base = base.mul(ruts.mul(-0.12).add(1));
    }
    // painted edge lines + dashed centre line
    const edge = step(0.018, U.x).mul(step(U.x, 0.042)).add(step(0.958, U.x).mul(step(U.x, 0.982)));
    const dash = step(abs(U.x.sub(0.5)), 0.006).mul(step(fract(U.y.mul(0.5)), 0.45)).mul(p.style === 'asphalt' ? 0.8 : 0.0);
    const paint = clamp(edge.add(dash), 0, 1).mul(p.style === 'asphalt' || p.style === 'metal' ? 1 : 0.55);
    m.colorNode = mix(base, color(p.line), paint).mul(vertexColor());
    m.roughnessNode = mix(float(m.roughness), float(0.55), paint);
    return m;
  });
}

function kerb(a = '#e84a3c', b = '#fafafa'): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('kerb', [a, b]), () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
    m.colorNode = mix(color(a), color(b), step(0.5, fract(uv().y)));
    return m;
  });
}

function wall(kind: string, a: string, b: string): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('wall', [kind, a, b]), () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
    const U = uv();
    if (kind === 'stone') {
      const n = mx_noise_float(positionWorld.mul(0.9)).mul(0.5).add(0.5);
      const course = smoothstep(0.0, 0.06, fract(positionWorld.y.mul(2.5)));
      m.colorNode = mix(color(a), color(b), n).mul(course.mul(0.25).add(0.75)).mul(vertexColor());
    } else {
      // painted safety barrier: alternating panels, top band
      const panel = step(0.5, fract(U.y.mul(0.5)));
      m.colorNode = mix(color(a), color(b), panel).mul(vertexColor());
    }
    return m;
  });
}

function terrain(a: string, b: string, c: string): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('terrain', [a, b, c]), () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    const n1 = mx_noise_float(positionWorld.xz.mul(0.02)).mul(0.5).add(0.5);
    const n2 = mx_noise_float(positionWorld.xz.mul(0.25)).mul(0.5).add(0.5);
    const slope = clamp(normalWorld.y.oneMinus().mul(3), 0, 1);
    const grass = mix(color(a), color(b), n1.mul(0.7).add(n2.mul(0.3)));
    m.colorNode = mix(grass, color(c), slope).mul(vertexColor());
    return m;
  });
}

function boostPad(): THREE.MeshStandardNodeMaterial {
  return memo('boostpad', () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, transparent: false });
    const U = uv();
    const chev = fract(U.y.mul(4).sub(time.mul(2.2)).add(abs(U.x.sub(0.5)).mul(1.6)));
    const on = step(0.55, chev);
    const edge = step(abs(U.x.sub(0.5)), 0.46);
    m.colorNode = mix(color('#0b6e5f'), color('#aaffea'), on).mul(edge.mul(0.8).add(0.2));
    m.emissiveNode = mix(color('#0a4d45'), color('#3dffd0'), on).mul(on.mul(1.6).add(0.3)).mul(edge);
    return m;
  });
}

function startLine(): THREE.MeshStandardNodeMaterial {
  return memo('startline', () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
    const U = uv();
    const ch = mod(floor(U.x.mul(18)).add(floor(U.y.mul(3))), 2);
    m.colorNode = mix(color('#141413'), color('#faf9f5'), ch);
    return m;
  });
}

/** Vinyl-toy mascot material: vertex-coloured palette, clearcoat, Fresnel rim (TSL, no onBeforeCompile). */
function vinyl(p: { rim?: string; clearcoat?: number; roughness?: number; tint?: THREE.Color | null }): THREE.MeshPhysicalNodeMaterial {
  return memo(keyOf('vinyl', { ...p, tint: p.tint ? p.tint.getHexString() : null }), () => {
    const m = new THREE.MeshPhysicalNodeMaterial({ roughness: p.roughness ?? 0.42, clearcoat: p.clearcoat ?? 0.6, clearcoatRoughness: 0.25, sheen: 0.2 });
    m.colorNode = vertexColor();
    const fres = pow(float(1).sub(max(dot(normalView, positionViewDirection), 0)), 2.6);
    m.emissiveNode = color(p.rim ?? '#ffd9c7').mul(fres).mul(0.38);
    return m;
  });
}

function kartPaint(primary: string): THREE.MeshPhysicalNodeMaterial {
  return memo(keyOf('kartPaint', primary), () => {
    const m = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.35, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
    m.colorNode = vertexColor();
    const fres = pow(float(1).sub(max(dot(normalView, positionViewDirection), 0)), 3);
    m.emissiveNode = color('#ffffff').mul(fres).mul(0.12);
    return m;
  });
}

function emissive(c: string, intensity: number): THREE.MeshBasicNodeMaterial {
  return memo(keyOf('emissive', [c, intensity]), () => {
    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = color(c).mul(intensity);
    return m;
  });
}

/** Additive flame material (boost exhaust); `boost` uniform fades it in/out. */
function flame(c1: string, c2: string): THREE.MeshBasicNodeMaterial {
  return memo(keyOf('flame', [c1, c2]), () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const U = uv();
    const flick = sin(time.mul(40).add(U.y.mul(12))).mul(0.15).add(0.85);
    const n = mx_noise_float(vec3(U.x.mul(3), U.y.mul(4).sub(time.mul(9)), 0.5)).mul(0.5).add(0.5);
    const along = U.y.oneMinus();
    const c = mix(color(c2), color(c1), along);
    m.colorNode = c.mul(n.mul(0.6).add(0.6)).mul(flick).mul(2.2);
    m.opacityNode = along.mul(smoothstep(0.0, 0.25, U.y)).mul(n);
    return m;
  });
}

function foliage(a: string, b: string): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('foliage', [a, b]), () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
    const n = mx_noise_float(positionWorld.mul(0.5)).mul(0.5).add(0.5);
    m.colorNode = mix(color(a), color(b), n).mul(vertexColor());
    return m;
  });
}

function vertexLit(roughness = 0.7, metalness = 0): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('vlit', [roughness, metalness]), () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness });
    m.colorNode = vertexColor();
    return m;
  });
}

export const boostUniform = uniform(0);

export const MaterialLibrary = {
  world, road, kerb, wall, terrain, boostPad, startLine, vinyl, kartPaint, emissive, flame, foliage, vertexLit,
  count(): number { return cache.size; },
  get(key: string): THREE.Material | undefined { return cache.get(key); },
  dispose(): void { for (const m of cache.values()) m.dispose(); cache.clear(); },
};
export type MaterialLibraryT = typeof MaterialLibrary;
export { Fn };
