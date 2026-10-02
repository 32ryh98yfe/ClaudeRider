// Calm sandstone paving for the desert roads. The library cobble (world.ts) darkens its mortar to 55 % and spreads the
// tile tones widely, which reads as busy noise at chase-camera distance. This variant keeps the same tile grid but
// uses a narrow tone range, joints at 84 % and a gentle relief, so the karts and the lane paint read first
// (34 §1.3). Built once per parameter set through MaterialLibrary.custom.
import * as THREE from 'three/webgpu';
import { color, float, vec2, vec3, uv, mix, step, smoothstep, fract, abs, floor, mod, clamp, vertexColor, max } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';
import { aaLines, cellRand, detailFade, fxUniforms, proceduralBump } from '../../materials/tsl.ts';

type N = any;

export interface PavingParams { a: string; b: string; line: string; tint: readonly [number, number, number] }

export function paving(p: PavingParams): THREE.Material {
  return MaterialLibrary.custom(`paving:${JSON.stringify(p)}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82 });
    const U = uv();
    // same 22 × 2.6 per-3 m grid as the library cobble, rows offset by half a tile
    const g = vec2(U.x.mul(22), U.y.mul(2.6));
    const row = floor(g.y), off = mod(row, 2).mul(0.5);
    const gx = fract(g.x.add(off)), gy = fract(g.y);
    const rnd = cellRand(vec2(floor(g.x.add(off)), row));
    const ex = abs(gx.sub(0.5)).mul(2), ey = abs(gy.sub(0.5)).mul(2);
    const dome = float(1).sub(max(ex.mul(ex), ey.mul(ey)));
    const joint = smoothstep(0.0, 0.1, dome);
    const tile: N = mix(color(p.a), color(p.b), rnd);
    let col: N = mix(tile.mul(0.84), tile, joint);
    // painted edge lines and a dashed centre line, as on every road (lower strength on paving)
    const edge = aaLines(U.x.sub(0.03), 0.012).mul(step(U.x, 0.06)).add(aaLines(U.x.sub(0.97), 0.012).mul(step(0.94, U.x)));
    const dash = smoothstep(0.009, 0.004, abs(U.x.sub(0.5))).mul(step(fract(U.y.mul(0.5)), 0.45));
    const paint = clamp(edge.add(dash), 0, 1).mul(0.55);
    col = mix(col, color(p.line), paint).mul(fxUniforms.wet.mul(-0.3).add(1));
    // vertex colour = baked AO × the trackc surface tint (divided back out)
    m.colorNode = col.mul(vertexColor().rgb.div(vec3(p.tint[0], p.tint[1], p.tint[2])));
    m.roughnessNode = mix(mix(float(0.9), float(0.8), joint), float(0.55), paint);
    m.normalNode = proceduralBump(dome.mul(joint), detailFade(4, 40).mul(0.03));
    return m;
  });
}
