import * as THREE from 'three/webgpu';
import { defineItemVfx } from '../api.ts';
import { disc } from '../geo.ts';
import { once, placeHazard } from '../proxy.ts';
import type { HazardView } from '../api.ts';
import { MaterialLibrary } from '../../../materials/library.ts';
import { setEmissive } from '../../../materials/tsl.ts';
import { uv, time, float, vec3, floor, fract, sin, dot, vec2, smoothstep, mix } from 'three/tsl';

// Glitch Puddle: a pixel-noise decal with RGB split; spins its victim with a pixel burst.
const geo = once(() => disc());
const PIXEL = [
  { shape: 4, additive: true, size0: 0.22, size1: 0.12, gravity: -6, drag: 1, spin: 6, emissive: 2 },
] as const;
function mat(): THREE.MeshBasicNodeMaterial {
  return MaterialLibrary.custom('glitchDecal', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const st = uv().sub(0.5);
    const r = st.length().mul(2);
    const cell = floor(uv().mul(22).add(vec2(floor(time.mul(8)), 0)));
    const rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453));
    const blob = smoothstep(1.0, 0.75, r.add(sin(st.x.mul(9).add(time)).mul(0.06)));
    const px = smoothstep(0.45, 0.55, rnd).mul(blob);
    const col = mix(vec3(0.18, 0.95, 1.0), vec3(1.0, 0.24, 0.65), fract(rnd.mul(7.3)));
    m.colorNode = col.mul(px.mul(1.3).add(blob.mul(0.15)));
    m.opacityNode = px.add(blob.mul(0.25)).clamp(0, 1);
    setEmissive(m, col.mul(px).mul(float(1.6)));
    return m;
  });
}

export default defineItemVfx({
  key: 'item.glitch_puddle',
  hazard() {
    const m = new THREE.Mesh(geo(), mat());
    const root = new THREE.Group(); root.add(m);
    return {
      root,
      update(v) {
        const h = v as HazardView;
        placeHazard(root, h); root.position.y += 0.06;
        m.scale.setScalar(Math.max(1, h.radius) * 2 * (h.armed ? 1 : 0.6));
      },
    };
  },
  use(fx, user) { if (user) fx.puff(user.pos, 5, '#2EF2FF', 0.8); },
  impact(fx, at) {
    for (let i = 0; i < 16; i++) fx.sparks.spawn(at.x, at.y + 0.5, at.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.6, i & 1 ? 0.18 : 1, i & 1 ? 0.95 : 0.24, i & 1 ? 1 : 0.65, PIXEL[0]);
  },
});
