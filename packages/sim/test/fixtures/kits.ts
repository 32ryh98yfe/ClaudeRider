// Physics fixtures (10-sim-spec §14, 50-test-plan §5): flat plane, straight corridor and corner kits. They are
// built in code rather than in the track DSL so every dimension is exact and independent of trackc's tessellation.
import { buildFixture, flatProfile, newMesh, sweep, turtle, wallStrip, type Fixture, type Seg } from './builder.ts';

const cache = new Map<string, Fixture>();
const memo = (key: string, make: () => Fixture): Fixture => { let f = cache.get(key); if (!f) { f = make(); cache.set(key, f); } return f; };

/** Flat plane 1 km wide along +x (start line at x = 0, main path from x = −100). No walls. */
export function flatPlane(): Fixture {
  return memo('flat', () => {
    const F = turtle([{ len: 2600 }], { x: -100, ds: 1 });
    const ground = newMesh();
    sweep(ground, F, () => flatProfile(-500, 500, 50), { every: 10 });
    return buildFixture({ id: 'flat', paths: [{ kind: 'main', closed: false, frames: F, wL: 500, wR: 500 }], ground, lineAt: 100 });
  });
}

/** Straight corridor `width` m wide (walls at ±width/2, 1 m high) along +x. */
export function corridor(width = 16, len = 1600): Fixture {
  return memo(`corridor${width}`, () => {
    const F = turtle([{ len }], { x: -100, ds: 1 });
    const ground = newMesh(), walls = newMesh();
    sweep(ground, F, () => flatProfile(-width / 2 - 2, width / 2 + 2, 8), { every: 4 });
    wallStrip(walls, F, () => -width / 2, -0.6, 1.0, { every: 4 });
    wallStrip(walls, F, () => width / 2, -0.6, 1.0, { every: 4 });
    return buildFixture({ id: 'corridor', paths: [{ kind: 'main', closed: false, frames: F, wL: width / 2, wR: width / 2 }], ground, walls, lineAt: 100 });
  });
}

export interface CornerKit extends Fixture { arcStart: number; arcEnd: number; width: number; rc: number; deg: number }

/**
 * Corner kit (gap-2 corner harness): 200 m approach, one arc of radius `rc` turning `deg` (left), 260 m exit,
 * on a `width` m road with walls at the road edges.
 */
export function cornerKit(rc: number, deg: number, width = 12): CornerKit {
  const key = `corner${rc}_${deg}_${width}`;
  const f = memo(key, () => {
    const segs: Seg[] = [{ len: 200 }, { r: rc, deg, dir: 'L' }, { len: 260 }];
    const F = turtle(segs, { ds: 0.5 });
    const ground = newMesh(), walls = newMesh();
    sweep(ground, F, () => flatProfile(-width / 2 - 1.5, width / 2 + 1.5, 6), { every: 1 });
    wallStrip(walls, F, () => -width / 2, -0.6, 1.0, { every: 1 });
    wallStrip(walls, F, () => width / 2, -0.6, 1.0, { every: 1 });
    return buildFixture({ id: key, paths: [{ kind: 'main', closed: false, frames: F, wL: width / 2, wR: width / 2 }], ground, walls, lineAt: 10 });
  });
  const arcLen = (rc * deg * Math.PI) / 180;
  return Object.assign(f, { arcStart: 200, arcEnd: 200 + arcLen, width, rc, deg });
}
