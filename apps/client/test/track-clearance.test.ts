import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { loadCtrk, toArrayBuffer, type BakedTrack, type FrameSample } from '@cr/sim';
import { loadContent } from '@cr/content';
import { PropRoadClearance } from '../src/render/track/clearance.ts';
import { getThemeKit } from '../src/render/themes/registry.ts';
import { buildTrackView } from '../src/render/track/TrackView.ts';
import { TrackHazards } from '../src/render/track/hazards.ts';
import type { GpuParticles } from '../src/render/vfx/gpuParticles.ts';

const DIR = new URL('../public/tracks/', import.meta.url);
const content = loadContent();
const load = (id: string): BakedTrack => loadCtrk(toArrayBuffer(readFileSync(new URL(`${id}.ctrk`, DIR))));
function straight(): BakedTrack {
  return {
    nPaths: 1, path: () => ({ kind: 'main', length: 80 }),
    frameAt: (_p: number, s: number, f: FrameSample) => Object.assign(f, { px: 0, py: 0, pz: s, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 8, wR: 8, flags: 0 }),
  } as unknown as BakedTrack;
}

describe('render-only scenery clearance', () => {
  it('rejects a solid cross-road wall but keeps the opening in a real arch, not just its bounding box', () => {
    const check = new PropRoadClearance(straight()), world = new THREE.Matrix4().makeTranslation(0, 0, 20);
    const wall = new THREE.BoxGeometry(20, 5, 1).translate(0, 2.5, 0);
    expect(check.conflict(wall, world)).not.toBeNull();
    const kit = getThemeKit('clayhill_village', content), arch = kit.props['stone_arch']!.build(kit.data.palette).geometry;
    expect(check.conflict(arch, world)).toBeNull();
    expect(check.conflict(wall, new THREE.Matrix4().makeTranslation(0, 5, 20))).toBeNull();
  });

  it('checks the whole triangle even when all three vertices lie outside the road', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-20, 1, -10, 20, 1, -10, 0, 1, 30], 3));
    expect(new PropRoadClearance(straight()).conflict(g, new THREE.Matrix4().makeTranslation(0, 0, 20))).not.toBeNull();
  });

  it('detects the reported road-crossing cliff, forest wall and shortcut shed geometry', () => {
    for (const sample of [
      { id: 'cascade_slalom', theme: 'canopy_forest', kind: 'forest_wall', at: [-195.8, 5.3, -228.2], yaw: 0 },
      { id: 'coral_cove_docks', theme: 'coral_cove', kind: 'net_shed', at: [54.4, -0.2, -373.8], yaw: 0 },
    ]) {
      const t = load(sample.id), kit = getThemeKit(sample.theme, content);
      const buf = toArrayBuffer(readFileSync(new URL(`${sample.id}.vis`, DIR)));
      const view = buildTrackView(buf, t, kit, { mergeChunks: 1, propFar: 400, foliage: 1 });
      expect(view.stats.rejectedProps, sample.id).toBeGreaterThan(0);
      const mesh = view.root.getObjectByName(`props:${sample.kind}`) as THREE.InstancedMesh;
      const test = new PropRoadClearance(t), m = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); expect(test.conflict(mesh.geometry, m)).toBeNull(); }
      expect(view.root.getObjectByName('props:gantry')).toBeDefined();
    }
  }, 15000);

  it('fits generated supports below real road height instead of protruding through the deck', () => {
    const t = load('aurora_summit'), check = new PropRoadClearance(t);
    const kit = getThemeKit('frostbyte_glacier', content), g = kit.props['pillar']!.build(kit.data.palette).geometry;
    const p = new THREE.Vector3(396.9, -108.8, -195.5), s = new THREE.Vector3(1, 3, 1);
    const before = s.y; check.fitPillar(g, p, s);
    expect(s.y).toBeLessThan(before);
    expect(check.conflict(g, new THREE.Matrix4().compose(p, new THREE.Quaternion(), s))).toBeNull();
  });
});

describe('track hazard presentation follows activity', () => {
  it('shows a warning then the damaging cannonball only during the live window', () => {
    const track = load('kraken_lighthouse'), kit = getThemeKit('coral_cove', content);
    const i = track.hazards.findIndex(h => h.name === 'ball1'), h = track.hazards[i]!;
    const view = new TrackHazards([{ id: i, name: h.name!, kind: h.kind, prop: 'hazard_cannonball', size: h.size, shape: h.shape }], track, kit);
    const particles = { rate: () => 0, burst: () => 0 } as unknown as GpuParticles;
    const body = view.root.children[0]!.children[0]!, ring = view.root.children[0]!.children[1]!;
    view.update(100, 0, 0, particles, particles);
    expect(body.visible).toBe(false); expect(ring.visible).toBe(false);
    view.update(h.periodTicks - 20, 0, 0, particles, particles);
    expect(body.visible).toBe(false); expect(ring.visible).toBe(true);
    view.update(5, 0, 0, particles, particles);
    expect(body.visible).toBe(true); expect(ring.visible).toBe(false);
  });
});
