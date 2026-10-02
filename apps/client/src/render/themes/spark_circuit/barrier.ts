// Spark Circuit safety barrier: a theme-specific wall material (MaterialLibrary.custom, so it is shared and counted).
// The generic panel look alternates red and white 3 m panels, which fought the red/white kerbs for attention in every
// frame; this one keeps the venue's ivory-and-red identity in an ordered way: ivory panels (every other one a shade
// darker, dark seams every 3 m for rhythm), a signal-red top band and cap, and a navy kick strip on the ground line
// so the barrier sits on the grass instead of floating. No per-pixel noise.
import * as THREE from 'three/webgpu';
import { color, float, uv, mix, step, smoothstep, clamp, vertexColor, mod, floor } from 'three/tsl';
import { aaLines } from '../../materials/tsl.ts';
import { MaterialLibrary } from '../../materials/library.ts';

type N = any; // TSL node graphs are dynamically typed (same convention as render/materials)

/** vis wall slot uv: x ∈ {0, 1/3, 2/3, 1} across [inner bottom, inner top, outer top, outer bottom]; y = s/3. */
export function sparkBarrier(face: string, band: string, kick: string): THREE.Material {
  return MaterialLibrary.custom(`sparkBarrier:${face}:${band}:${kick}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.62 });
    const U = uv();
    const inner: N = U.x.mul(3);
    const onTop: N = step(0.98, inner).mul(step(U.x, 0.66));
    const hFrac: N = clamp(mix(inner, float(3).sub(U.x.mul(3)), step(0.66, U.x)), 0, 1);
    // the face starts 0.6 m below the ground (ground ≈ hFrac 0.375 on a 1 m barrier): the kick strip covers the foot
    const top: N = clamp(smoothstep(0.78, 0.8, hFrac).add(onTop), 0, 1);
    const kickBand: N = step(hFrac, 0.44);
    const panel: N = mod(floor(U.y), 2);
    let c: N = color(face).mul(panel.mul(-0.05).add(1));
    c = mix(c, color(kick), kickBand);
    c = mix(c, color(band), top);
    c = c.mul(aaLines(U.y, 0.01).mul(-0.4).add(1));
    m.colorNode = c.mul(vertexColor());
    m.roughnessNode = mix(float(0.62), float(0.5), top);
    return m;
  });
}
