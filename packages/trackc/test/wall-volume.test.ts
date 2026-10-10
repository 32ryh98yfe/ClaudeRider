import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TFLAG } from '@cr/sim';
import { wallTriangles } from '../src/mesh.ts';
import { RenderBuilder, wallsToRender } from '../src/render.ts';
import { TriSoup, type WallQuad } from '../src/soup.ts';

describe('road-wall physical volume', () => {
  it('matches every visible inner, top and outer face and preserves the inner driving edge', () => {
    const w: WallQuad = { path: 0, side: 1, flg: TFLAG.SOFT | TFLAG.GORE, kind: 'fence', a0: [5, -.6, 0], a1: [5, 1.5, 0], b0: [5, -.6, 10], b1: [5, 1.5, 10], sa: 0, sb: 10, out: [1, 0, 0], render: true };
    const soup = new TriSoup(); wallTriangles([w], soup);
    expect(soup.count).toBe(6); expect(new Set(soup.flg)).toEqual(new Set([w.flg]));
    const rb = new RenderBuilder(); wallsToRender(rb, [w], () => 1);
    const triangle = new THREE.Triangle(), point = new THREE.Vector3(), nearest = new THREE.Vector3();
    for (const slot of rb.finalise()) for (let i = 0; i < slot.idx.length; i += 3) {
      point.set(0, 0, 0);
      for (let k = 0; k < 3; k++) point.add(new THREE.Vector3().fromArray(slot.pos, slot.idx[i + k]! * 3));
      point.multiplyScalar(1 / 3); let distance = Infinity;
      for (let t = 0; t < soup.count; t++) {
        triangle.a.fromArray(soup.vert(t, 0)); triangle.b.fromArray(soup.vert(t, 1)); triangle.c.fromArray(soup.vert(t, 2));
        triangle.closestPointToPoint(point, nearest); distance = Math.min(distance, nearest.distanceTo(point));
      }
      expect(distance).toBeLessThan(1e-6);
    }
    expect(Math.min(...soup.v.filter((_, i) => i % 8 === 0))).toBe(5);
    const invisible = new TriSoup(); wallTriangles([{ ...w, render: false }], invisible); expect(invisible.count).toBe(2);
  });
});
