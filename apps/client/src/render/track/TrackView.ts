// .vis → render meshes (per slot per ~50 m chunk, shared attributes), instanced props, item boxes.
// - Chunks are frustum-culled by three (bounding spheres) and beyond the tier's camera far plane; on Low,
//   contiguous chunks of a slot are merged (150 m) to trade culling granularity for fewer draw calls.
// - Props stay one InstancedMesh per kind (1 draw), but the instance list is rebuilt from a frustum + distance
//   test every few frames, so off-screen and far props cost no triangles (large landmarks keep a longer range).
// - Material slots resolve exactly (`road`, `wall`, …), then by family (`wall.rock` → wall material of type rock,
//   `road.ice`, `water`), then fall back to a magenta placeholder with a dev warning (never a crash).
import * as THREE from 'three/webgpu';
import { CVIS_MAGIC, CVIS_VERSION, readContainer, type BakedTrack } from '@cr/sim';
import type { ThemeKit } from '../themes/kit.ts';
import { PLACEHOLDER_PROP } from '../props/defaults.ts';
import { MaterialLibrary } from '../materials/library.ts';
import { merge, paint, place, rbox, box } from '../util/geo.ts';

export interface VisMeta {
  id: string; themeId: string; name: string;
  slots: { name: string; material: string; chunks: { i0: number; n: number; bbox: number[] }[] }[];
  props: { kind: string; n: number }[];
  bounds: number[];
  line: { x: number; y: number; z: number; fx: number; fy: number; fz: number; w: number };
  theme: Record<string, string>;
  lapLength: number;
}

export interface TrackViewOptions { mergeChunks: number; propFar: number; foliage: number }

export interface TrackView {
  root: THREE.Group; meta: VisMeta; minimap: Float32Array; boxes: THREE.InstancedMesh | null;
  update(t: number, boxAvail: (i: number) => boolean, camera?: THREE.Camera): void;
  /** World position of item box `i` (for shatter VFX). */
  boxPos(i: number, out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
  stats: { meshes: number; tris: number };
}

/** Big props keep a longer visibility range than scatter. */
const LANDMARK = /house|windmill|tower|gantry|arch|stand|building|lighthouse|ship|galleon|crane|monolith|obelisk|tree_giant|pillar/;
const SCATTER = /bush|flower|grass|rock|fence|lamp|cone|sign|chevron|barrel|crate|mushroom/;

function resolveMaterial(name: string, mats: Record<string, THREE.Material>, kit: ThemeKit, warned: Set<string>): THREE.Material {
  const exact = mats[name];
  if (exact) return exact;
  const [family, variant] = name.split(/[.:]/) as [string, string | undefined];
  const L = kit.look;
  if (family === 'wall' && variant) return MaterialLibrary.wall(variant, L.wall.a, L.wall.b);
  if (family === 'road' && variant) return MaterialLibrary.road({ ...L.road, style: variant as never });
  if (family === 'water') return MaterialLibrary.water(L.water ? { shallow: L.water.shallow, deep: L.water.deep, foam: L.water.foam ?? '#ffffff' } : { shallow: '#7FE3D6', deep: '#1FB5C9' });
  if (family === 'kerb') return MaterialLibrary.kerb(L.kerb[0], L.kerb[1]);
  if (family === 'jumppad' || family === 'pad') return MaterialLibrary.boostPad();
  if (mats[family]) return mats[family]!;
  if (import.meta.env.DEV && !warned.has(name)) { warned.add(name); console.warn(`[track] no material for vis slot "${name}"; using placeholder`); }
  return MaterialLibrary.world({ color: '#ff00ff', roughness: 0.8 });
}

/** Original "Prompt Cube": ivory rounded cube, coral edge frame, and a coral "?" glyph on each side (bloom). */
function promptCube(): { body: THREE.BufferGeometry; glyph: THREE.BufferGeometry } {
  const s = 1.3, e = 0.09;
  const frame: THREE.BufferGeometry[] = [paint(rbox(s, s, s, 0.26, 3), '#FAF9F5')];
  for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    frame.push(paint(place(box(s + 0.02, e, e), 0, ay * (s / 2 - 0.02), ax * (s / 2 - 0.02)), '#D97757'));
    frame.push(paint(place(box(e, s + 0.02, e), ax * (s / 2 - 0.02), 0, ay * (s / 2 - 0.02)), '#D97757'));
    frame.push(paint(place(box(e, e, s + 0.02), ax * (s / 2 - 0.02), ay * (s / 2 - 0.02), 0), '#D97757'));
  }
  // "?" glyph: a hook of bars plus a dot, then placed on four faces
  const q = (): THREE.BufferGeometry => merge([
    paint(place(box(0.34, 0.09, 0.03), 0, 0.3, 0), '#D97757'),
    paint(place(box(0.09, 0.22, 0.03), 0.13, 0.2, 0), '#D97757'),
    paint(place(box(0.2, 0.09, 0.03), 0.05, 0.08, 0), '#D97757'),
    paint(place(box(0.09, 0.14, 0.03), 0, -0.03, 0), '#D97757'),
    paint(place(box(0.1, 0.1, 0.03), 0, -0.22, 0), '#D97757'),
  ]);
  const faces: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) { const g = q(); g.translate(0, 0, s / 2 + 0.02); g.rotateY((k * Math.PI) / 2); faces.push(g); }
  return { body: merge(frame), glyph: merge(faces) };
}

export function buildTrackView(visBuf: ArrayBuffer, track: BakedTrack, kit: ThemeKit, opts: TrackViewOptions = { mergeChunks: 1, propFar: 400, foliage: 1 }): TrackView {
  const c = readContainer(visBuf, CVIS_MAGIC, CVIS_VERSION);
  const meta = c.meta as VisMeta;
  const root = new THREE.Group();
  root.name = `track:${meta.id}`;
  const mats = kit.materials();
  const warned = new Set<string>();
  let meshes = 0, tris = 0;
  meta.slots.forEach((slot, j) => {
    const pos = c.arrays.get(`s${j}.pos`) as Float32Array, nrm = c.arrays.get(`s${j}.nrm`) as Float32Array;
    const uv = c.arrays.get(`s${j}.uv`) as Float32Array, col = c.arrays.get(`s${j}.col`) as Float32Array, idx = c.arrays.get(`s${j}.idx`) as Uint32Array;
    const aPos = new THREE.BufferAttribute(pos, 3), aNrm = new THREE.BufferAttribute(nrm, 3), aUv = new THREE.BufferAttribute(uv, 2), aCol = new THREE.BufferAttribute(col, 3);
    const mat = resolveMaterial(slot.material, mats, kit, warned);
    // merge runs of contiguous chunks (same index buffer, adjacent ranges) into groups of `mergeChunks`
    const groups: { i0: number; n: number; bbox: number[] }[] = [];
    for (const ch of slot.chunks) {
      const last = groups[groups.length - 1];
      const run = last ? (last as { k?: number }).k ?? 1 : 0;
      if (last && run < opts.mergeChunks && last.i0 + last.n === ch.i0 && slot.name !== 'terrain') {
        last.n += ch.n;
        for (let k = 0; k < 3; k++) { last.bbox[k] = Math.min(last.bbox[k]!, ch.bbox[k]!); last.bbox[k + 3] = Math.max(last.bbox[k + 3]!, ch.bbox[k + 3]!); }
        (last as { k?: number }).k = run + 1;
      } else groups.push({ i0: ch.i0, n: ch.n, bbox: [...ch.bbox] });
    }
    for (const ch of groups) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', aPos); g.setAttribute('normal', aNrm); g.setAttribute('uv', aUv); g.setAttribute('color', aCol);
      g.setIndex(new THREE.BufferAttribute(idx.subarray(ch.i0, ch.i0 + ch.n), 1));
      const [x0, y0, z0, x1, y1, z1] = ch.bbox as [number, number, number, number, number, number];
      g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = slot.name === 'wall' || slot.name.startsWith('wall.');
      m.name = `${slot.name}#${meshes}`;
      m.matrixAutoUpdate = false;
      root.add(m);
      meshes++; tris += ch.n / 3;
    }
  });
  // props: one InstancedMesh per kind; instances are culled per frame into a compact list
  interface PropSet { im: THREE.InstancedMesh; mats: Float32Array; cx: Float32Array; cy: Float32Array; cz: Float32Array; r: Float32Array; n: number; far: number }
  const props: PropSet[] = [];
  meta.props.forEach((p, j) => {
    const xf = c.arrays.get(`p${j}.xf`) as Float32Array;
    const f = kit.props[p.kind] ?? PLACEHOLDER_PROP;
    if (!kit.props[p.kind] && import.meta.env.DEV) console.warn(`[props] no factory for ${p.kind}`);
    const built = f.build(kit.data.palette);
    const isLandmark = LANDMARK.test(p.kind), isScatter = SCATTER.test(p.kind);
    // foliage density per tier: thin out scatter deterministically (keep every k-th instance)
    const keep = isScatter || /tree|bush/.test(p.kind) ? opts.foliage : 1;
    const n0 = p.n;
    const list: number[] = [];
    for (let i = 0; i < n0; i++) if (keep >= 1 || ((i * 0.618034) % 1) < keep) list.push(i);
    const n = list.length;
    const im = new THREE.InstancedMesh(built.geometry, built.material, Math.max(1, n));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    built.geometry.computeBoundingSphere();
    const gs = built.geometry.boundingSphere!;
    const set: PropSet = { im, mats: new Float32Array(n * 16), cx: new Float32Array(n), cy: new Float32Array(n), cz: new Float32Array(n), r: new Float32Array(n), n, far: opts.propFar * (isLandmark ? 2.5 : isScatter ? 0.6 : 1) };
    list.forEach((i, k) => {
      const o = i * 6;
      v.set(xf[o]!, xf[o + 1]!, xf[o + 2]!);
      q.setFromAxisAngle(up, xf[o + 3]!);
      const sc = xf[o + 4]!;
      s.set(p.kind === 'chevron' && xf[o + 5] === 1 ? -sc : sc, sc, sc);
      m4.compose(v, q, s);
      m4.toArray(set.mats, k * 16);
      im.setMatrixAt(k, m4);
      set.cx[k] = v.x + gs.center.x * sc; set.cy[k] = v.y + gs.center.y * sc; set.cz[k] = v.z + gs.center.z * sc; set.r[k] = gs.radius * sc;
    });
    im.count = n;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false; // culled per instance below
    im.castShadow = built.castShadow ?? false;
    im.receiveShadow = true;
    im.name = `props:${p.kind}`;
    root.add(im);
    props.push(set);
    meshes++; tris += (built.geometry.index ? built.geometry.index.count : built.geometry.attributes.position!.count) / 3 * n;
  });
  // item boxes ("Prompt Cubes") + glyphs (two instanced draws)
  let boxes: THREE.InstancedMesh | null = null, glyphs: THREE.InstancedMesh | null = null;
  if (track.boxes.length) {
    const g = promptCube();
    boxes = new THREE.InstancedMesh(g.body, MaterialLibrary.vinyl({ rim: '#ffd9c7', clearcoat: 1, roughness: 0.22 }), track.boxes.length);
    boxes.name = 'itemBoxes';
    boxes.castShadow = true;
    glyphs = new THREE.InstancedMesh(g.glyph, MaterialLibrary.emissiveVertex(2.6), track.boxes.length);
    glyphs.name = 'itemBoxGlyphs';
    boxes.frustumCulled = glyphs.frustumCulled = false;
    root.add(boxes, glyphs);
    meshes += 2;
  }
  const minimap = (c.arrays.get('minimap') as Float32Array) ?? new Float32Array(0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(), camPos = new THREE.Vector3();
  let frameNo = 0;
  const cullProps = (camera: THREE.Camera): void => {
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    for (let pi = 0; pi < props.length; pi++) {
      const ps = props[pi]!;
      const arr = ps.im.instanceMatrix.array as Float32Array, src = ps.mats;
      let k = 0;
      const far2 = ps.far * ps.far;
      for (let i = 0; i < ps.n; i++) {
        const dx = ps.cx[i]! - camPos.x, dy = ps.cy[i]! - camPos.y, dz = ps.cz[i]! - camPos.z;
        if (dx * dx + dy * dy + dz * dz > far2) continue;
        sph.center.set(ps.cx[i]!, ps.cy[i]!, ps.cz[i]!); sph.radius = ps.r[i]! + 12; // margin keeps nearby off-screen shadows
        if (!frustum.intersectsSphere(sph)) continue;
        if (k !== i) { const a = i * 16, b = k * 16; for (let c = 0; c < 16; c++) arr[b + c] = src[a + c]!; }
        k++;
      }
      if (k > 0 || ps.im.count !== 0) { ps.im.count = k; ps.im.instanceMatrix.clearUpdateRanges(); ps.im.instanceMatrix.addUpdateRange(0, k * 16); ps.im.instanceMatrix.needsUpdate = true; }
      ps.im.visible = k > 0;
    }
  };
  return {
    root, meta, minimap, boxes, stats: { meshes, tris },
    update(t: number, boxAvail: (i: number) => boolean, camera?: THREE.Camera): void {
      if (camera && (frameNo++ % 3 === 0)) cullProps(camera);
      if (!boxes || !glyphs) return;
      for (let i = 0; i < track.boxes.length; i++) {
        const b = track.boxes[i]!;
        const on = boxAvail(i);
        v.set(b.x, b.y + Math.sin(t * 2 + i) * 0.12, b.z);
        q.setFromEuler(e.set(0.35, t * 1.4 + i * 0.7, 0.25));
        const sc = on ? 1 : 0.001;
        boxes.setMatrixAt(i, m4.compose(v, q, s.set(sc, sc, sc)));
        glyphs.setMatrixAt(i, m4);
      }
      boxes.instanceMatrix.needsUpdate = true;
      glyphs.instanceMatrix.needsUpdate = true;
    },
    boxPos(i: number, out: THREE.Vector3): THREE.Vector3 { const b = track.boxes[i]; return b ? out.set(b.x, b.y, b.z) : out.set(0, 0, 0); },
    dispose(): void { root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); },
  };
}
