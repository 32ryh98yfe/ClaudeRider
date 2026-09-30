// Skies per kind (30-art-bible §4): Preetham SkyMesh for day/golden/sunset/overcast, and a procedural dome for
// night (stars + moon), aurora (animated ribbons), underground (cave vault + crystal glints) and space
// (dense stars, nebula, ringed planet). Domes render at the far plane like SkyMesh so any camera far works.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, vec4, mix, smoothstep, normalize, positionLocal, time, sin, abs, fract, floor, dot, max, pow, clamp,
  atan, uniform, Fn, modelViewProjection, length,
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { MaterialLibrary } from '../materials/library.ts';
import { setEmissive, n01 } from '../materials/tsl.ts';
import type { EnvLook } from './look.ts';

type N = any;

export interface SkyObject { object: THREE.Object3D; /** optional per-frame hook (dome follows the camera) */ update?(camPos: THREE.Vector3): void; moonDir: THREE.Vector3 | null }

const rand3 = (c: N): N => fract(sin(dot(c, vec3(127.1, 311.7, 74.7))).mul(43758.5453));

export function buildSky(L: EnvLook, lite = false): SkyObject {
  // Low tier: the Preetham sky + cloud fbm is one of the largest shaders; use the gradient dome with a sun and clouds
  if (!lite && (L.kind === 'day' || L.kind === 'goldenHour' || L.kind === 'sunset' || L.kind === 'overcast')) {
    const s = new SkyMesh();
    s.scale.setScalar(4500);
    s.turbidity.value = L.kind === 'overcast' ? 9 : L.sky.turbidity;
    s.rayleigh.value = L.kind === 'overcast' ? 0.6 : L.sky.rayleigh;
    s.mieCoefficient.value = L.sky.mie; s.mieDirectionalG.value = L.sky.mieG;
    s.sunPosition.value.copy(L.sunDir);
    s.cloudCoverage.value = L.kind === 'overcast' ? 0.92 : L.sky.clouds || (L.kind === 'sunset' ? 0.3 : 0.38);
    s.cloudDensity.value = L.kind === 'overcast' ? 0.9 : 0.45;
    s.showSunDisc.value = L.kind === 'overcast' ? 0 : 1;
    s.name = 'sky';
    return { object: s, moonDir: null };
  }
  const key = `sky${lite ? 'Lite' : ''}:${L.kind}:${L.sunDir.x.toFixed(2)},${L.sunDir.y.toFixed(2)}:${L.sky.top}:${L.sky.bottom}:${L.sky.horizon}:${L.sky.stars}:${L.sky.moon}:${L.sky.aurora}:${JSON.stringify(L.sky.planet)}`;
  const moonDir = new THREE.Vector3(L.sunDir.x, Math.max(0.35, L.sunDir.y), L.sunDir.z).normalize();
  const mat = MaterialLibrary.custom(key, () => domeMaterial(L, moonDir));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  dome.scale.setScalar(4000);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  dome.name = 'sky';
  return { object: dome, moonDir: L.sky.moon ? moonDir : null };
}

function domeMaterial(L: EnvLook, moonDir: THREE.Vector3): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  m.vertexNode = Fn(() => { const p = (modelViewProjection as N).toVar(); p.z.assign(p.w); return p; })();
  const dir = normalize(positionLocal);
  const h = dir.y;
  const top = color(L.sky.top), bottom = color(L.sky.bottom), hor = color(L.sky.horizon);
  let c: N = mix(mix(hor, bottom, smoothstep(-0.25, 0.02, h.negate()).oneMinus()), top, smoothstep(0.02, 0.65, h));
  let glow: N = vec3(0);
  const kind = L.kind;
  if (kind === 'day' || kind === 'goldenHour' || kind === 'sunset' || kind === 'overcast') {
    // lite day sky: horizon → zenith gradient, warm sun glow and disc, two-octave cloud bands
    const sd = normalize(vec3(L.sunDir.x, L.sunDir.y, L.sunDir.z));
    const cosS = max(dot(dir, sd), 0);
    const warm = kind === 'day' ? color('#fff2d8') : kind === 'overcast' ? color('#f4f6f8') : color('#ffc58a');
    c = mix(color(L.sky.horizon), color(L.sky.top), smoothstep(-0.02, 0.55, h)).add(warm.mul(pow(cosS, 12).mul(kind === 'overcast' ? 0.1 : 0.45)));
    c = mix(c, color(L.sky.bottom), smoothstep(0.0, -0.3, h));
    const cp = dir.xz.div(max(h, 0.05)).mul(0.9);
    const cl = smoothstep(0.55, 0.8, n01(vec3(cp.x.add(time.mul(0.004)), cp.y, 0.5)).mul(0.7).add(n01(vec3(cp.mul(3.1), 2.5)).mul(0.3))).mul(smoothstep(0.02, 0.2, h));
    c = mix(c, mix(color('#ffffff'), warm, 0.25), cl.mul(kind === 'overcast' ? 0.9 : 0.65));
    const disc = smoothstep(0.9993, 0.9996, cosS).mul(kind === 'overcast' ? 0 : 1);
    c = c.add(warm.mul(disc.mul(4)));
    glow = warm.mul(disc.mul(1.5));
  }
  if (kind === 'underground') {
    // cave vault: rocky noise overhead, warm glow low on the horizon, sparse crystal glints
    const rock = n01(dir.mul(9)).mul(0.6).add(n01(dir.mul(23)).mul(0.4));
    c = mix(color('#2a1a14'), color('#0b0807'), smoothstep(-0.1, 0.5, h)).mul(rock.mul(0.6).add(0.55));
    c = c.add(color('#ff6a2b').mul(smoothstep(0.25, -0.05, abs(h)).mul(0.18)));
    const cell = floor(dir.mul(90));
    const glint = smoothstep(0.994, 1.0, rand3(cell)).mul(smoothstep(0.0, 0.2, h));
    const hueK = rand3(cell.add(7.3));
    glow = mix(color('#7FDBFF'), color('#C77DFF'), hueK).mul(glint.mul(2.5));
  }
  if (L.sky.stars > 0) {
    const dens = L.sky.stars;
    const cell = floor(dir.mul(kind === 'space' ? 260 : 200));
    const r = rand3(cell);
    const tw = sin(time.mul(2.5).add(r.mul(40))).mul(0.3).add(0.7);
    const star = smoothstep(1 - 0.006 * dens, 1.0, r).mul(tw).mul(kind === 'space' ? float(1) : smoothstep(-0.02, 0.25, h));
    const big = smoothstep(1 - 0.0008 * dens, 1.0, rand3(floor(dir.mul(70)).add(3.1))).mul(smoothstep(0.0, 0.3, h).add(kind === 'space' ? 1 : 0).min(1));
    c = c.add(vec3(star.mul(0.9).add(big.mul(1.4))));
    glow = glow.add(vec3(big.mul(0.6)));
  }
  if (kind === 'space') {
    // nebula wash and a faint galactic band
    const neb = n01(dir.mul(2.2)).mul(n01(dir.mul(5.1).add(4))).mul(smoothstep(0.35, 0.0, abs(dot(dir, normalize(vec3(0.3, 0.8, -0.5))))));
    c = c.add(mix(color('#6A4C93'), color('#1FB5C9'), n01(dir.mul(3.3))).mul(neb.mul(0.55)));
    const p = L.sky.planet;
    if (p) {
      const pd = normalize(vec3(p.dir?.[0] ?? -0.5, p.dir?.[1] ?? 0.35, p.dir?.[2] ?? -0.8));
      const size = p.size ?? 0.16;
      const cosA = dot(dir, pd);
      const d = float(1).sub(cosA).mul(2).sqrt();                 // ≈ angle
      const disc = smoothstep(size, size - 0.004, d);
      const limb = pow(clamp(float(1).sub(d.div(size)), 0, 1), 0.5);
      const bands = sin(dir.y.mul(90).add(n01(dir.mul(20)).mul(3))).mul(0.08).add(0.92);
      const lit = clamp(dot(dir.sub(pd), normalize(vec3(L.sunDir.x, L.sunDir.y, L.sunDir.z))).mul(8).add(0.6), 0.15, 1.2);
      const planet = color(p.color).mul(limb.mul(0.7).add(0.3)).mul(bands).mul(lit);
      c = mix(c, planet, disc);
      if (p.ring) {
        // ring: a thin band around the planet's equator plane (tilted), hidden where the disc is in front
        const up = normalize(vec3(0.25, 1, 0.1));
        const off = dir.sub(pd.mul(cosA));
        const rr = length(off).div(size);
        const flat = abs(dot(normalize(off), up));
        const ring = smoothstep(0.12, 0.0, flat).mul(smoothstep(1.35, 1.45, rr)).mul(smoothstep(2.3, 2.1, rr)).mul(float(1).sub(disc.mul(step01(dot(off, up)))));
        c = mix(c, color(p.ring), ring.mul(0.7));
      }
      glow = glow.add(color(p.color).mul(smoothstep(size * 1.25, size, d).mul(float(1).sub(disc)).mul(0.35)));
    }
  }
  if (L.sky.moon) {
    const md = normalize(vec3(moonDir.x, moonDir.y, moonDir.z));
    const cosA = dot(dir, md);
    const disc: N = smoothstep(0.99955, 0.9997, cosA);
    const crater = n01(dir.mul(420)).mul(0.25).add(0.75);
    const halo: N = pow(max(cosA, 0), 180).mul(0.35).add(pow(max(cosA, 0), 18).mul(0.06));
    c = c.add(color('#fff3c4').mul(disc.mul(crater).mul(1.8))).add(color('#9fb8ff').mul(halo));
    glow = glow.add(color('#fff3c4').mul(disc.mul(1.2)));
  }
  if (L.sky.aurora) {
    const a = atan(dir.z, dir.x);
    const wave = sin(a.mul(3).add(time.mul(0.12)).add(n01(vec2(a.mul(1.7), time.mul(0.05))).mul(3))).mul(0.07).add(0.3);
    const dy = h.sub(wave);
    const curtain = smoothstep(0.0, 0.03, dy).mul(smoothstep(0.26, 0.02, dy));
    const rays = n01(vec2(a.mul(60), time.mul(0.4))).mul(0.7).add(0.3);
    const col = mix(color('#6CF2C2'), color('#B57CFF'), smoothstep(0.02, 0.22, dy));
    const aur = col.mul(curtain.mul(rays)).mul(smoothstep(-0.05, 0.15, h));
    c = c.add(aur.mul(0.9));
    glow = glow.add(aur.mul(0.8));
  }
  m.colorNode = c;
  setEmissive(m, glow);
  return m;
}

/** 0/1 step helper usable on nodes (1 when x > 0). */
function step01(x: N): N { return smoothstep(-0.0001, 0.0001, x); }

export { uniform, vec4 };
