// Road material for the glacier kit that dresses halfpipe walls. The hp60 profile is part of the road ribbon, so its
// 60° walls rendered as the same dark asphalt and the halfpipe read as a dark tube. Wherever the road surface is
// steeper than ≈ 18° (no road bank on these tracks goes past 10°), this blends to packed snow (#c9d6e4), then toward
// ice (#9fd3ea) near the lip, with a navy band on the steepest strip at the very top. Matte snow, glossier ice.
import * as THREE from 'three/webgpu';
import { color, float, mix, normalWorld, smoothstep, vertexColor } from 'three/tsl';
import { MaterialLibrary } from '../../materials/library.ts';

type N = any;

export function halfpipeRoad(base: THREE.MeshStandardNodeMaterial): THREE.Material {
  // the base key carries the quality profile, so each tier gets its own variant
  return MaterialLibrary.custom(`hpRoad:${base.name}`, () => {
    const m = base.clone();
    const ny: N = normalWorld.y;
    const wall = smoothstep(0.95, 0.85, ny);   // 18° → 32°: asphalt → packed snow
    const ice = smoothstep(0.72, 0.58, ny);    // 44° → 55°: snow → ice toward the lip
    const band = smoothstep(0.575, 0.555, ny); // ≥ 56°: the navy top band
    let c: N = mix(color('#c9d6e4'), color('#9fd3ea'), ice);
    c = mix(c, color('#2f4a7a'), band);
    m.colorNode = mix(base.colorNode as N, c.mul(vertexColor().rgb), wall);
    m.roughnessNode = mix(base.roughnessNode as N, mix(float(0.8), float(0.3), ice), wall);
    return m;
  });
}
