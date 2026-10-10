import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { CVIS_MAGIC, CVIS_VERSION, toArrayBuffer, writeContainer, type BakedTrack } from '@cr/sim';
import type { ModeId } from '@cr/content';
import { buildTrackView } from '../src/render/track/TrackView.ts';
import type { ThemeKit } from '../src/render/themes/kit.ts';

const vis = toArrayBuffer(writeContainer(CVIS_MAGIC, CVIS_VERSION, {
  id: 'boxes', themeId: 'test', slots: [], props: [], theme: {}, bounds: [0, 0, 0, 100, 10, 100],
  line: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, w: 12 }, lapLength: 100,
}, []));
const track = { grid: [], boxes: [{ x: 10, y: 1.5, z: 20 }, { x: 15, y: 1.5, z: 20 }] } as unknown as BakedTrack;
const kit = { materials: () => ({}), props: {} } as unknown as ThemeKit;

describe('mode-aware item box scene', () => {
  it.each<ModeId>(['speed', 'infinite', 'timeAttack'])('omits bodies, glyphs and their shadows in %s', (mode) => {
    const view = buildTrackView(vis, track, kit, { mode, mergeChunks: 1, propFar: 400, foliage: 1 });
    expect(view.boxes).toBeNull();
    view.update(1, () => true);
    expect(view.root.getObjectByName('itemBoxes')).toBeUndefined();
    expect(view.root.getObjectByName('itemBoxGlyphs')).toBeUndefined();
    view.dispose();
  });

  it('retains each player’s pickup and respawn visibility for item races', () => {
    const view = buildTrackView(vis, track, kit, { mode: 'item', mergeChunks: 1, propFar: 400, foliage: 1 });
    const glyphs = view.root.getObjectByName('itemBoxGlyphs') as THREE.InstancedMesh;
    expect(view.boxes?.count).toBe(2);
    expect(glyphs.count).toBe(2);
    const body = new THREE.Matrix4(), glyph = new THREE.Matrix4();
    const scales = new THREE.Vector3();
    for (const available of [false, true]) {
      view.update(1, (i) => i === 1 || available);
      view.boxes!.getMatrixAt(0, body);
      glyphs.getMatrixAt(0, glyph);
      expect(body.equals(glyph)).toBe(true);
      scales.setFromMatrixScale(body);
      expect(scales.x).toBeCloseTo(available ? 1 : 0.001, 5);
      view.boxes!.getMatrixAt(1, body);
      expect(new THREE.Vector3().setFromMatrixScale(body).x).toBeCloseTo(1, 5);
    }
    view.dispose();
  });
});
