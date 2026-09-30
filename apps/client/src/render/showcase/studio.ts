// Studio kit shared by the lobby Showcase, portraits and the contact sheets: seamless cyclorama (one lathe surface,
// floor curving into the wall, so there is no horizon line), soft key + two rim lights, and a PMREM studio environment
// for the clearcoat highlights on vinyl and candy paint.
import * as THREE from 'three/webgpu';
import { color, mix, smoothstep, positionWorld, float, uv, vec2 } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface StudioLook { floor: string; wall: string; top: string; key: string; rimA: string; rimB: string; hemiSky: string; hemiGround: string }
export const STUDIO_WARM: StudioLook = {
  floor: '#f3e7da', wall: '#d9b8a0', top: '#3b2a22', key: '#fff0e2', rimA: '#a9d8ff', rimB: '#ffc9a8', hemiSky: '#fff4ea', hemiGround: '#7a5a48',
};

export interface Studio {
  group: THREE.Group;
  key: THREE.DirectionalLight;
  rims: THREE.DirectionalLight[];
  hemi: THREE.HemisphereLight;
  cyc: THREE.Mesh | null;
  envTex: THREE.Texture | null;
  dispose(): void;
}

/** Profile of the infinity cove: flat floor → quarter-circle fillet → vertical wall. Smooth normals, one surface. */
function coveGeometry(floorR: number, filletR: number, wallH: number, seg: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
  for (let i = 1; i <= 6; i++) pts.push(new THREE.Vector2((floorR * i) / 6, 0));
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    pts.push(new THREE.Vector2(floorR + Math.sin(a) * filletR, filletR - Math.cos(a) * filletR));
  }
  for (let i = 1; i <= 6; i++) pts.push(new THREE.Vector2(floorR + filletR, filletR + ((wallH - filletR) * i) / 6));
  return new THREE.LatheGeometry(pts, seg);
}

export function createStudio(renderer: THREE.WebGPURenderer | null, scene: THREE.Scene, o: { look?: StudioLook; cyclorama?: boolean; shadowSize?: number; env?: boolean } = {}): Studio {
  const L = o.look ?? STUDIO_WARM;
  const group = new THREE.Group();
  group.name = 'studio';
  let cyc: THREE.Mesh | null = null;
  if (o.cyclorama !== false) {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const r = positionWorld.xz.length();
    const y = positionWorld.y;
    // one continuous function of (radius, height): bright pool under the subject → warm wall → dark top (logo contrast)
    const pool = mix(color(L.floor), color(L.wall), smoothstep(2.5, 11, r));
    m.colorNode = mix(pool, color(L.top), smoothstep(1.5, 12, y).pow(0.8));
    cyc = new THREE.Mesh(coveGeometry(9, 6, 26, 64), m);
    cyc.receiveShadow = true;
    cyc.name = 'cyclorama';
    group.add(cyc);
  }
  const key = new THREE.DirectionalLight(L.key, 2.6);
  key.position.set(3.5, 7.5, 5.5);
  const ss = o.shadowSize ?? 1024;
  key.castShadow = ss > 0;
  if (ss > 0) {
    key.shadow.mapSize.set(ss, ss);
    const c = key.shadow.camera; c.left = -3.2; c.right = 3.2; c.top = 3.2; c.bottom = -3.2; c.near = 1; c.far = 20;
    key.shadow.radius = 5; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  }
  const rimA = new THREE.DirectionalLight(L.rimA, 2.3); rimA.position.set(-5, 3.5, -5);
  const rimB = new THREE.DirectionalLight(L.rimB, 1.5); rimB.position.set(5.5, 2.5, -4);
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, 1.0);
  group.add(key, key.target, rimA, rimB, hemi);
  scene.add(group);
  let envTex: THREE.Texture | null = null;
  if (renderer && o.env !== false) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envTex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;
    room.traverse((x) => { if (x instanceof THREE.Mesh) x.geometry.dispose(); });
    pmrem.dispose();
  }
  return {
    group, key, rims: [rimA, rimB], hemi, cyc, envTex,
    dispose(): void {
      scene.remove(group);
      if (cyc) { cyc.geometry.dispose(); (cyc.material as THREE.Material).dispose(); }
      envTex?.dispose();
    },
  };
}

/** Soft contact shadow blob (multiplied darkening under a subject), cheap and resolution-independent. */
export function contactShadow(w: number, d: number, strength = 0.55): THREE.Mesh {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const p = uv().sub(0.5).mul(vec2(2, 2));
  const r = p.length();
  m.colorNode = color('#2a1a12');
  m.opacityNode = smoothstep(1.0, 0.15, r).pow(1.6).mul(float(strength));
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 1;
  mesh.name = 'contactShadow';
  return mesh;
}
