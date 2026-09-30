// .vis → render meshes (per slot per ~50 m chunk, shared attributes), instanced props, item boxes.
import * as THREE from 'three/webgpu';
import { CVIS_MAGIC, CVIS_VERSION, readContainer, type BakedTrack } from '@cr/sim';
import type { ThemeKit } from '../themes/kit.ts';
import { PLACEHOLDER_PROP } from '../props/defaults.ts';
import { MaterialLibrary } from '../materials/library.ts';
import { merge, paint, place, rbox } from '../util/geo.ts';

export interface VisMeta {
  id: string; themeId: string; name: string;
  slots: { name: string; material: string; chunks: { i0: number; n: number; bbox: number[] }[] }[];
  props: { kind: string; n: number }[];
  bounds: number[];
  line: { x: number; y: number; z: number; fx: number; fy: number; fz: number; w: number };
  theme: Record<string, string>;
  lapLength: number;
}

export interface TrackView { root: THREE.Group; meta: VisMeta; minimap: Float32Array; boxes: THREE.InstancedMesh | null; update(t: number, boxAvail: (i: number) => boolean): void; dispose(): void; stats: { meshes: number; tris: number } }

export function buildTrackView(visBuf: ArrayBuffer, track: BakedTrack, kit: ThemeKit): TrackView {
  const c = readContainer(visBuf, CVIS_MAGIC, CVIS_VERSION);
  const meta = c.meta as VisMeta;
  const root = new THREE.Group();
  root.name = `track:${meta.id}`;
  const mats = kit.materials();
  let meshes = 0, tris = 0;
  meta.slots.forEach((slot, j) => {
    const pos = c.arrays.get(`s${j}.pos`) as Float32Array, nrm = c.arrays.get(`s${j}.nrm`) as Float32Array;
    const uv = c.arrays.get(`s${j}.uv`) as Float32Array, col = c.arrays.get(`s${j}.col`) as Float32Array, idx = c.arrays.get(`s${j}.idx`) as Uint32Array;
    const aPos = new THREE.BufferAttribute(pos, 3), aNrm = new THREE.BufferAttribute(nrm, 3), aUv = new THREE.BufferAttribute(uv, 2), aCol = new THREE.BufferAttribute(col, 3);
    const mat = mats[slot.material] ?? MaterialLibrary.world({ color: '#ff00ff', roughness: 0.8 });
    for (const ch of slot.chunks) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', aPos); g.setAttribute('normal', aNrm); g.setAttribute('uv', aUv); g.setAttribute('color', aCol);
      g.setIndex(new THREE.BufferAttribute(idx.subarray(ch.i0, ch.i0 + ch.n), 1));
      const [x0, y0, z0, x1, y1, z1] = ch.bbox as [number, number, number, number, number, number];
      g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = slot.name === 'wall';
      m.name = `${slot.name}#${meshes}`;
      root.add(m);
      meshes++; tris += ch.n / 3;
    }
  });
  // props
  meta.props.forEach((p, j) => {
    const xf = c.arrays.get(`p${j}.xf`) as Float32Array;
    const f = kit.props[p.kind] ?? PLACEHOLDER_PROP;
    if (!kit.props[p.kind] && import.meta.env.DEV) console.warn(`[props] no factory for ${p.kind}`);
    const built = f.build(kit.data.palette);
    const im = new THREE.InstancedMesh(built.geometry, built.material, p.n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < p.n; i++) {
      const o = i * 6;
      v.set(xf[o]!, xf[o + 1]!, xf[o + 2]!);
      q.setFromAxisAngle(up, xf[o + 3]!);
      const sc = xf[o + 4]!;
      s.set(p.kind === 'chevron' && xf[o + 5] === 1 ? -sc : sc, sc, sc);
      im.setMatrixAt(i, m4.compose(v, q, s));
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = built.castShadow ?? false;
    im.receiveShadow = true;
    im.name = `props:${p.kind}`;
    root.add(im);
    meshes++; tris += (built.geometry.index ? built.geometry.index.count : built.geometry.attributes.position!.count) / 3 * p.n;
  });
  // item boxes ("prompt cubes"): rounded cube with a sparkle glyph
  let boxes: THREE.InstancedMesh | null = null;
  if (track.boxes.length) {
    const g = merge([paint(rbox(1.3, 1.3, 1.3, 0.28, 3), '#ffffff'), paint(place(rbox(0.5, 0.5, 1.36, 0.1, 2), 0, 0, 0, 0, 0, Math.PI / 4), '#d97757'), paint(place(rbox(1.36, 0.5, 0.5, 0.1, 2), 0, 0, 0, Math.PI / 4, 0, 0), '#d97757')]);
    const mat = MaterialLibrary.vinyl({ rim: '#7de2fc', clearcoat: 1, roughness: 0.2 });
    boxes = new THREE.InstancedMesh(g, mat, track.boxes.length);
    boxes.name = 'itemBoxes';
    boxes.castShadow = true;
    root.add(boxes);
    meshes++;
  }
  const minimap = (c.arrays.get('minimap') as Float32Array) ?? new Float32Array(0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    root, meta, minimap, boxes, stats: { meshes, tris },
    update(t: number, boxAvail: (i: number) => boolean): void {
      if (!boxes) return;
      for (let i = 0; i < track.boxes.length; i++) {
        const b = track.boxes[i]!;
        const on = boxAvail(i);
        v.set(b.x, b.y + Math.sin(t * 2 + i) * 0.12, b.z);
        q.setFromEuler(e.set(0.4, t * 1.4 + i * 0.7, 0.3));
        const sc = on ? 1 : 0.001;
        boxes.setMatrixAt(i, m4.compose(v, q, s.set(sc, sc, sc)));
      }
      boxes.instanceMatrix.needsUpdate = true;
    },
    dispose(): void { root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); },
  };
}
