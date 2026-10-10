import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DrivingClearance } from '../src/clearance.ts';
import { TriSoup } from '../src/soup.ts';
import { ROLE } from '../src/mesh.ts';
import { bake, frame, hit } from './helpers.ts';

function floor(): TriSoup {
  const s = new TriSoup(), v = (x: number, z: number): number[] => [x, 0, z, 0, 1, 0, z, x];
  s.push(v(-5, -5), v(-5, 5), v(5, -5), 0, 0, 0, ROLE.ROAD);
  s.push(v(5, -5), v(-5, 5), v(5, 5), 0, 0, 0, ROLE.ROAD);
  return s;
}

describe('full road-volume clearance', () => {
  it('closes volume seams across adjacent faces using their shared vertex normals', () => {
    const ground = new TriSoup(), shared = [0, 0.998758526924799, -0.0498137018801598];
    const a = [-1, 0, 0, ...shared, 0, 0], b = [1, 0, 0, ...shared, 0, 0];
    ground.push(a, b, [0, 0, -1, 0, 1, 0, 0, 0], 0, 0, 0, ROLE.ROAD);
    ground.push(b, a, [0, 0.1, 1, 0, 0.995037190209989, -0.099503719020999, 0, 0], 0, 0, 0, ROLE.ROAD);
    const clear = new DrivingClearance(ground, 0.02);
    expect(clear.clip([[-0.2, -0.2, 0.008], [0.2, -0.2, 0.008], [0, -0.2, 0.013]])).toEqual([]);
  });

  it('protects the full overhanging kart sphere at an outer ground edge', () => {
    const clear = new DrivingClearance(floor(), 2.25, 0.6, 0.85);
    // The foot can stand at x4.9; its sphere reaches x5.75 beyond the ground edge at x5.
    expect(clear.clip([[5.5, 0.4, -0.2], [5.5, 0.8, -0.2], [5.5, 0.6, 0.2]])).toEqual([]);
  });

  it('cuts a triangle crossing the entire road even when every vertex is outside', () => {
    const clear = new DrivingClearance(floor());
    const input = [[-20, 1, -10], [20, 1, -10], [0, 1, 30]];
    expect(clear.conflict(input)).not.toBeNull();
    const output = clear.clip(input);
    expect(output.length).toBeGreaterThan(0);
    const origin = new THREE.Vector3(0, 1, 0), nearest = new THREE.Vector3(), tri = new THREE.Triangle();
    for (const p of output) for (let i = 1; i + 1 < p.length; i++) {
      tri.set(new THREE.Vector3(...p[0] as [number, number, number]), new THREE.Vector3(...p[i] as [number, number, number]), new THREE.Vector3(...p[i + 1] as [number, number, number]));
      tri.closestPointToPoint(origin, nearest);
      expect(nearest.distanceTo(origin)).toBeGreaterThanOrEqual(4.99);
    }
  });

  it.each([
    ['orbital_nexus/token_foundry.ctd', 238, 0],
    ['spark_circuit/sunset_arena_rally.ctd', 134, 0],
    ['spark_circuit/sunset_arena_rally.ctd', 134, -1],
    ['lantern_hollow/manor_catacombs.ctd', 515.5, 2],
    ['canopy_forest/fernwood_hollow.ctd', 659.5, 2],
  ] as const)('actual underside/terrain clears the grounded kart on %s s=%s u=%s', (name, station, lateral) => {
    const r = bake(name, { props: false }), f = frame(), h = hit();
    r.track.frameAt(0, station, f);
    const x = f.px + f.rx * lateral, y = f.py + f.ry * lateral, z = f.pz + f.rz * lateral;
    expect(r.track.groundRay(x + f.ux, y + f.uy, z + f.uz, -f.ux, -f.uy, -f.uz, 2, h)).toBe(true);
    const sphere = new THREE.Vector3(h.x + h.nx * 0.6, h.y + h.ny * 0.6, h.z + h.nz * 0.6), nearest = new THREE.Vector3(), tri = new THREE.Triangle();
    let distance = Infinity;
    for (const sl of r.slots) if (sl.material === 'terrain' || sl.name === 'underside') {
      const p = sl.pos;
      for (let i = 0; i < sl.idx.length; i += 3) {
        tri.a.fromArray(p, sl.idx[i]! * 3); tri.b.fromArray(p, sl.idx[i + 1]! * 3); tri.c.fromArray(p, sl.idx[i + 2]! * 3);
        tri.closestPointToPoint(sphere, nearest); distance = Math.min(distance, nearest.distanceTo(sphere));
      }
    }
    expect(distance).toBeGreaterThan(0.85);
  });
});

describe('stored geometry contact regressions', () => {
  it('removes the f32-amplified clipping sliver inside Belltower plaza', () => {
    const r = bake('clayhill_village/belltower_piazza.ctd', { props: false });
    const p = new THREE.Vector3(170.68389892578125, 4.6, -205.57066345214844), q = new THREE.Vector3(), tri = new THREE.Triangle();
    let nearest = Infinity;
    for (const slot of r.slots) if (slot.name === 'underside') for (let i = 0; i < slot.idx.length; i += 3) {
      tri.a.fromArray(slot.pos, slot.idx[i]! * 3); tri.b.fromArray(slot.pos, slot.idx[i + 1]! * 3); tri.c.fromArray(slot.pos, slot.idx[i + 2]! * 3);
      tri.closestPointToPoint(p, q); nearest = Math.min(nearest, q.distanceTo(p));
    }
    expect(nearest).toBeGreaterThan(0.85);
  });

  it('ground winding agrees with authored up after a tight Pumpkin landing row transition', () => {
    const ground = new TriSoup();
    const a = [233.0763855, -.49193773, -280.14227295, -.055, .998, -.019, 0, 0];
    const b = [235.3688049, -.35138407, -279.35293579, -.055, .998, -.019, 0, 0];
    const c = [233.0602722, -.49423105, -280.09408569, -.055, .998, -.019, 0, 0];
    ground.push(a, b, c, 1, 0, 0, ROLE.ROAD);
    expect(ground.orientGround()).toBe(1);
    const v = [0, 1, 2].map(k => new THREE.Vector3(...ground.vert(0, k).slice(0, 3) as [number, number, number]));
    expect(new THREE.Triangle(v[0]!, v[1]!, v[2]!).getNormal(new THREE.Vector3()).y).toBeGreaterThan(.99);
    expect(ground.orientGround()).toBe(0);
  });
});
