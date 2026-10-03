import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { loadContent } from '@cr/content';
import { CVIS_MAGIC, CVIS_VERSION, loadCtrk, readContainer, toArrayBuffer } from '@cr/sim';
import { TrackHazards, type HazardVisMeta } from '../src/render/track/hazards.ts';
import { fitHazardBody, fitHazardSuspension } from '../src/render/track/hazardBody.ts';
import { getThemeKit } from '../src/render/themes/registry.ts';

const DIR = new URL('../public/tracks/', import.meta.url);
const content = loadContent();

describe('visible hazard bodies match their collision volume', () => {
  it('keeps every damaging triangle of every public custom hazard inside its declared convex collider', () => {
    const models = new Set<string>(), suspended = new Set<string>();
    let checkedVertices = 0;
    for (const entry of content.tracks.all) {
      const track = loadCtrk(toArrayBuffer(readFileSync(new URL(`${entry.id}.ctrk`, DIR))));
      const vis = readContainer(toArrayBuffer(readFileSync(new URL(`${entry.id}.vis`, DIR))), CVIS_MAGIC, CVIS_VERSION);
      const metas = (vis.meta as { hazards?: HazardVisMeta[] }).hazards ?? [];
      const kit = getThemeKit(track.meta.themeId, content);
      const view = new TrackHazards(metas, track, kit);
      metas.forEach((meta, i) => {
        const factory = kit.props[meta.prop] ?? kit.props[`hazard_${meta.kind === 'traffic' ? 'car' : meta.kind}`];
        if (!factory) return;
        const def = track.hazards[meta.id]!, root = view.root.children[i]!;
        const body = root.getObjectByName('hazardBody') as THREE.Mesh;
        const p = body.geometry.getAttribute('position'), [a, b, c] = def.size;
        models.add(meta.prop);
        if (root.getObjectByName('hazardSuspension')) suspended.add(meta.prop);
        // Each shape is convex: containing the vertices also contains the complete visible triangles.
        for (let j = 0; j < p.count; j++) {
          const x = p.getX(j), y = p.getY(j), z = p.getZ(j), label = `${entry.id}/${meta.name}/${j}`;
          if (def.shape === 'box') {
            expect(Math.abs(x), label).toBeLessThanOrEqual(b / 2 + 0.00001);
            expect(Math.abs(z), label).toBeLessThanOrEqual(a / 2 + 0.00001);
            expect(y, label).toBeGreaterThanOrEqual(-0.00001);
            expect(y, label).toBeLessThanOrEqual(c + 0.00001);
          } else if (def.shape === 'sphere') expect(Math.hypot(x, y, z), label).toBeLessThanOrEqual(a + 0.00001);
          else if (def.kind === 'swinger' || def.motion?.type === 'pendulum' || def.motion?.type === 'rotate') {
            expect(Math.hypot(x, z, Math.max(0, Math.abs(y) - b / 2)), label).toBeLessThanOrEqual(a + 0.00001);
          } else {
            expect(Math.hypot(x, z), label).toBeLessThanOrEqual(a + 0.00001);
            expect(y, label).toBeGreaterThanOrEqual(-0.00001);
            expect(y, label).toBeLessThanOrEqual(b + 0.00001);
          }
          checkedVertices++;
        }
      });
      view.dispose();
    }
    expect(models.size).toBeGreaterThanOrEqual(14);
    expect(checkedVertices).toBeGreaterThan(10000);
    expect([...suspended].sort()).toEqual(['hazard_chandelier', 'hazard_lantern', 'hazard_log', 'hazard_net', 'hazard_press']);
  }, 15000);

  it('removes the tentacle tip overlap that had no collision at the edge of Kraken Lighthouse’s road', () => {
    const kit = getThemeKit('coral_cove', content), source = kit.props['hazard_tentacle']!.build(kit.data.palette).geometry;
    const original = source.getAttribute('position').array.slice();
    const shape = { kind: 'swinger', shape: 'cyl', size: [0.9, 2.5, 0] };
    const fitted = fitHazardBody(source, shape);
    // Actual road point: tentacle1, tick270, path s=hazard.s−0.5,u=−6 on its16m-wide road.
    const centre = new THREE.Vector3(1.3800929466108727, -3.039100810297171, -0.5);
    const surfaceDistance = (geometry: THREE.BufferGeometry): number => {
      const p = geometry.getAttribute('position'), idx = geometry.index, tri = new THREE.Triangle(), point = new THREE.Vector3();
      let distance = Infinity;
      for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
        tri.a.fromBufferAttribute(p, idx ? idx.getX(i) : i);
        tri.b.fromBufferAttribute(p, idx ? idx.getX(i + 1) : i + 1);
        tri.c.fromBufferAttribute(p, idx ? idx.getX(i + 2) : i + 2);
        tri.closestPointToPoint(centre, point);
        distance = Math.min(distance, point.distanceTo(centre));
      }
      return distance;
    };
    expect(surfaceDistance(source)).toBeLessThan(0.85);
    expect(surfaceDistance(fitted.geometry)).toBeGreaterThan(0.85);
    expect(source.getAttribute('position').array).toEqual(original);
    fitted.geometry.dispose();
  });

  it('keeps suspension anchors and source geometry intact while following the fitted body attachment', () => {
    const kit = getThemeKit('lantern_hollow', content), built = kit.props['hazard_lantern']!.build(kit.data.palette);
    const body = fitHazardBody(built.geometry, { kind: 'swinger', shape: 'cyl', size: [0.8, 2, 0] });
    const source = built.hazardDecoration!, original = source.getAttribute('position').array.slice();
    source.computeBoundingBox();
    const rope = fitHazardSuspension(source, body.transform); rope.computeBoundingBox();
    expect(rope.boundingBox!.max.y).toBeCloseTo(source.boundingBox!.max.y, 5);
    expect(rope.boundingBox!.min.y).toBeCloseTo(new THREE.Vector3(0, source.boundingBox!.min.y, 0).applyMatrix4(body.transform).y, 5);
    expect(source.getAttribute('position').array).toEqual(original);
    body.geometry.dispose(); rope.dispose();
  });

  it('disposes both owned meshes once while preserving shared kit geometry for the next race', () => {
    const track = loadCtrk(toArrayBuffer(readFileSync(new URL('pumpkin_lane.ctrk', DIR))));
    const kit = getThemeKit('lantern_hollow', content), built = kit.props['hazard_lantern']!.build(kit.data.palette);
    const sharedBody = vi.spyOn(built.geometry, 'dispose'), sharedRope = vi.spyOn(built.hazardDecoration!, 'dispose');
    const h = track.hazards.find((entry) => entry.name === 'lantern1')!;
    const view = new TrackHazards([{ id: h.id, name: h.name!, kind: h.kind, prop: 'hazard_lantern', size: h.size, shape: h.shape }],
      track, { ...kit, props: { ...kit.props, hazard_lantern: { build: () => built } } });
    const body = view.root.getObjectByName('hazardBody') as THREE.Mesh;
    const suspension = view.root.getObjectByName('hazardSuspension') as THREE.Mesh;
    const bodyDispose = vi.spyOn(body.geometry, 'dispose'), ropeDispose = vi.spyOn(suspension.geometry, 'dispose');
    view.dispose(); view.dispose();
    expect(bodyDispose).toHaveBeenCalledOnce(); expect(ropeDispose).toHaveBeenCalledOnce();
    expect(sharedBody).not.toHaveBeenCalled(); expect(sharedRope).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
