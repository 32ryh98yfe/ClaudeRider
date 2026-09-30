// L8 dev contact sheets (served by Vite in dev at /src/dev/contact-sheet.html; not a build input).
//   ?sheet=chars      12 characters × front / three-quarter / back-from-chase-camera
//   ?sheet=karts      8 karts × two liveries, three-quarter front / rear / side
//   ?sheet=race       the whole roster in karts on a road from the chase camera (auto LOD) + far-distance panel
//   ?sheet=portraits  getPortrait() output at 128 and 64 px
//   ?sheet=one&char=<id>&kart=<id>&yaw=<deg>   a single large turntable frame (look-dev)
// Add &renderer=webgl2 for headless SwiftShader. `window.__sheetDone` flips to true when the canvas is final.
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import * as THREE from 'three/webgpu';
import { buildMascot, RIG, type MascotInstance } from '../render/mascot/rig.ts';
import { allCharacters, getCharacter } from '../render/characters/registry.ts';
import { allKartBodies, getKartBody } from '../render/karts/registry.ts';
import type { KartModel, Livery } from '../render/karts/types.ts';
import { createStudio, contactShadow } from '../render/showcase/studio.ts';
import { localMaterialCount } from '../render/mascot/materials.ts';
import { getPortrait, setPortraitRenderer } from '../render/portrait/portrait.ts';

declare global { interface Window { __sheetDone?: boolean; __sheetInfo?: unknown } }

const q = new URLSearchParams(location.search);
const SHEET = q.get('sheet') ?? 'chars';
const status = document.getElementById('status')!;
const out = document.getElementById('sheet') as HTMLCanvasElement;
const ctx = out.getContext('2d')!;

const LIVERIES: Record<string, [Livery, Livery]> = {
  pebble: [{ primary: '#D97757', secondary: '#FAF9F5', pattern: 1, number: 7 }, { primary: '#6A9BCC', secondary: '#F5F4ED', pattern: 3, number: 21 }],
  clay_comet: [{ primary: '#E8A87C', secondary: '#FAF9F5', pattern: 4, number: 3 }, { primary: '#788C5D', secondary: '#F2C14E', pattern: 1, number: 12 }],
  arrowhead: [{ primary: '#E5484D', secondary: '#FAF9F5', pattern: 2, number: 1 }, { primary: '#30302E', secondary: '#FFD23F', pattern: 2, number: 44 }],
  tugboat: [{ primary: '#F2C14E', secondary: '#30302E', pattern: 5, number: 9 }, { primary: '#788C5D', secondary: '#C9B38A', pattern: 5, number: 88 }],
  glacier_sled: [{ primary: '#BEE9F7', secondary: '#6A9BCC', pattern: 9, number: 5 }, { primary: '#F7FBFF', secondary: '#B57CFF', pattern: 9, number: 16 }],
  neon_blade: [{ primary: '#1C1F26', secondary: '#FF3EA5', pattern: 6, number: 0 }, { primary: '#1C1F26', secondary: '#3EE6FF', pattern: 6, number: 77 }],
  jet_kettle: [{ primary: '#B87333', secondary: '#E0B04B', pattern: 8, number: 4 }, { primary: '#5A6B7B', secondary: '#B87333', pattern: 8, number: 31 }],
  crown_cruiser: [{ primary: '#7A2E4F', secondary: '#F2C14E', pattern: 7, number: 1 }, { primary: '#2E3A7A', secondary: '#F2C14E', pattern: 7, number: 10 }],
};
const liveryFor = (id: string, i: 0 | 1): Livery => (LIVERIES[id] ?? LIVERIES.pebble!)[i];

async function main(): Promise<void> {
  const forceWebGL = q.get('renderer') === 'webgl2';
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL, alpha: false });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setPortraitRenderer(renderer);
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  const t0 = performance.now();
  if (SHEET === 'chars') await charsSheet(renderer);
  else if (SHEET === 'karts') await kartsSheet(renderer);
  else if (SHEET === 'race') await raceSheet(renderer);
  else if (SHEET === 'portraits') await portraitSheet();
  else await oneSheet(renderer);
  status.textContent = `${SHEET} · ${((performance.now() - t0) / 1000).toFixed(1)} s · L8 materials ${localMaterialCount()}`;
  window.__sheetDone = true;
}

function size(w: number, h: number): void { out.width = w; out.height = h; ctx.fillStyle = '#1b1918'; ctx.fillRect(0, 0, w, h); }
function label(text: string, x: number, y: number, px = 14, col = '#f3ede6', align: CanvasTextAlign = 'left'): void {
  ctx.fillStyle = col; ctx.font = `600 ${px}px system-ui, sans-serif`; ctx.textAlign = align; ctx.fillText(text, x, y);
}
async function shoot(r: THREE.WebGPURenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, w: number, h: number, x: number, y: number): Promise<void> {
  r.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  await r.compileAsync(scene, cam);
  r.render(scene, cam);
  ctx.drawImage(r.domElement, x, y, w, h);
  await new Promise((res) => setTimeout(res, 0));
}
const idlePose = { steer: 0, lean: 0, speed01: 0, drifting: false, boosting: false, airborne: false, hit: 0 as const };
function settle(m: MascotInstance, frames = 30): void { for (let i = 0; i < frames; i++) { m.root.updateMatrixWorld(true); m.setPose(idlePose, 1 / 30); } m.root.updateMatrixWorld(true); }

// --------------------------------------------------------------------------------------------------------------
async function charsSheet(r: THREE.WebGPURenderer): Promise<void> {
  const chars = allCharacters();
  const CW = 220, CH = 230, HEAD = 34, cols = 6;
  const angles: Array<[string, number, number]> = [['front', 0, 0.08], ['¾', -0.72, 0.22], ['chase (back)', Math.PI, 0.42]];
  const blocks = Math.ceil(chars.length / cols);
  size(cols * CW, blocks * (angles.length * CH + HEAD) + 40);
  label('L8 · Clawd roster — front / three-quarter / back from the chase camera', 12, 26, 18);
  const scene = new THREE.Scene();
  createStudio(r, scene, { shadowSize: 1024 });
  const cam = new THREE.PerspectiveCamera(26, CW / CH, 0.1, 100);
  const shadow = contactShadow(1.5, 1.1, 0.5); shadow.position.y = 0.002; scene.add(shadow);
  for (let i = 0; i < chars.length; i++) {
    const def = chars[i]!;
    const m = buildMascot(def);
    m.setLod(0); m.setStance('stand');
    // standing on the floor: legs bottom at y = -0.51
    m.root.position.y = 0.51;
    scene.add(m.root);
    settle(m);
    const col = i % cols, blk = Math.floor(i / cols);
    const bx = col * CW, by = 40 + blk * (angles.length * CH + HEAD);
    for (let a = 0; a < angles.length; a++) {
      const [, yaw, pitch] = angles[a]!;
      const dist = 3.1;
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.62 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      cam.lookAt(0, 0.62, 0);
      await shoot(r, scene, cam, CW, CH, bx, by + a * CH);
    }
    const st = m.stats();
    label(`${def.id}`, bx + 8, by + angles.length * CH + 20, 15);
    label(`${st.tris[0]}/${st.tris[1]}/${st.tris[2]} tris · ${st.draws[0]} draws`, bx + CW - 8, by + angles.length * CH + 20, 11, '#b8aea4', 'right');
    scene.remove(m.root);
    m.dispose();
    status.textContent = `chars ${i + 1}/${chars.length}`;
  }
  for (let a = 0; a < angles.length; a++) label(angles[a]![0], 6, 40 + a * CH + 16, 12, '#b8aea4');
}

// --------------------------------------------------------------------------------------------------------------
function mountKart(kartId: string, charId: string, livery: Livery): { kart: KartModel; mascot: MascotInstance; group: THREE.Group } {
  const kart = getKartBody(kartId).build(livery);
  const mascot = buildMascot(getCharacter(charId));
  mascot.root.scale.setScalar(RIG.seatScale);
  kart.seat.add(mascot.root);
  const group = new THREE.Group();
  group.add(kart.root);
  return { kart, mascot, group };
}
function poseKart(k: { kart: KartModel; mascot: MascotInstance; group: THREE.Group }, steer = 0.25, frames = 30): void {
  for (let i = 0; i < frames; i++) {
    k.group.updateMatrixWorld(true);
    k.kart.update({ steer, wheelSpin: 0, boost: 0, drift: false, speed: 0 }, 1 / 30);
    k.mascot.setPose({ ...idlePose, steer }, 1 / 30);
  }
  k.group.updateMatrixWorld(true);
}

async function kartsSheet(r: THREE.WebGPURenderer): Promise<void> {
  const karts = allKartBodies();
  const CW = 330, CH = 220, LW = 150;
  const views: Array<[string, number, number, 0 | 1]> = [['¾ front · livery A', -0.75, 0.3, 0], ['¾ rear · livery B', 2.45, 0.34, 1], ['side · livery A', -Math.PI / 2, 0.08, 0]];
  size(LW + views.length * CW, 40 + karts.length * CH);
  label('L8 · karts — two liveries each (driver: Clay)', 12, 26, 18);
  const scene = new THREE.Scene();
  createStudio(r, scene, { shadowSize: 1024 });
  const cam = new THREE.PerspectiveCamera(24, CW / CH, 0.1, 100);
  for (let i = 0; i < karts.length; i++) {
    const def = karts[i]!;
    for (let v = 0; v < views.length; v++) {
      const [, yaw, pitch, li] = views[v]!;
      const k = mountKart(def.id, 'clay', liveryFor(def.id, li));
      k.kart.setLod?.(0); k.mascot.setLod(0);
      const sh = contactShadow(def.dims.width * 1.5, def.dims.length * 1.35, 0.6); sh.position.y = 0.003; k.group.add(sh);
      scene.add(k.group);
      poseKart(k, v === 2 ? 0 : 0.3);
      const dist = 5.4;
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.5 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      cam.lookAt(0, 0.45, 0);
      await shoot(r, scene, cam, CW, CH, LW + v * CW, 40 + i * CH);
      scene.remove(k.group);
      k.kart.dispose(); k.mascot.dispose();
    }
    const st = getKartBody(def.id).build(liveryFor(def.id, 0));
    const s = st.stats?.();
    st.dispose();
    label(def.id, 12, 40 + i * CH + 28, 16);
    label(`${def.dims.length}×${def.dims.width}×${def.dims.height} m`, 12, 40 + i * CH + 48, 11, '#b8aea4');
    if (s) { label(`tris ${s.tris.join(' / ')}`, 12, 40 + i * CH + 66, 11, '#b8aea4'); label(`draws ${s.draws.join(' / ')}`, 12, 40 + i * CH + 82, 11, '#b8aea4'); }
    status.textContent = `karts ${i + 1}/${karts.length}`;
  }
  for (let v = 0; v < views.length; v++) label(views[v]![0], LW + v * CW + 8, 36, 12, '#b8aea4');
}

// --------------------------------------------------------------------------------------------------------------
function roadScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9fd3f5');
  scene.fog = new THREE.Fog('#cfe6f2', 60, 260);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 400), new THREE.MeshStandardNodeMaterial({ color: '#5f6166', roughness: 0.88 }));
  road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardNodeMaterial({ color: '#7fae62', roughness: 0.95 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; scene.add(grass);
  for (const x of [-7.6, 7.6]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 400), new THREE.MeshStandardNodeMaterial({ color: '#f4f1ea', roughness: 0.6 }));
    line.rotation.x = -Math.PI / 2; line.position.set(x, 0.005, 0); scene.add(line);
  }
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.position.set(20, 40, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -40; c.right = 40; c.top = 60; c.bottom = -20; c.far = 120;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, new THREE.HemisphereLight('#cfe8ff', '#6a7a52', 1.1));
  return scene;
}

async function raceSheet(r: THREE.WebGPURenderer): Promise<void> {
  const chars = allCharacters(), karts = allKartBodies();
  const W = 1280, H = 720;
  size(W, H * 2 + 80);
  label('L8 · race distance — chase camera, auto LOD (LOD1 > 25 m, LOD2 > 70 m)', 12, 26, 18);
  const scene = roadScene();
  const env = new THREE.PMREMGenerator(r);
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  scene.environment = env.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.4;
  const items: Array<ReturnType<typeof mountKart>> = [];
  chars.forEach((c, i) => {
    const kd = karts[i % karts.length]!;
    const k = mountKart(kd.id, c.id, liveryFor(kd.id, (i % 2) as 0 | 1));
    const row = Math.floor(i / 3), lane = (i % 3) - 1;
    k.group.position.set(lane * 3.6 + (row % 2) * 1.2, 0, row * 7.5 + 4);
    scene.add(k.group);
    items.push(k);
  });
  for (const k of items) poseKart(k, 0.15);
  const cam = new THREE.PerspectiveCamera(70, W / H, 0.3, 1000);
  // player kart (front-middle) with the chase offset: 5.2 m behind, ~2.1 m up, looking 1.2 m above & ahead
  cam.position.set(0, 2.1, -1.4); cam.lookAt(0, 1.0, 12);
  await shoot(r, scene, cam, W, H, 0, 40);
  label('chase camera: grid from 5 m to 35 m ahead', 12, 40 + H - 12, 14);
  // far panel: same grid seen from 60–95 m (LOD1/LOD2 silhouettes at true pixel size)
  cam.fov = 40; cam.position.set(-6, 5, -55); cam.lookAt(0, 0.6, 20);
  await shoot(r, scene, cam, W, H, 0, 80 + H);
  label('far: 60–95 m (LOD1/LOD2 at true pixel size)', 12, 80 + 2 * H - 12, 14);
}

// --------------------------------------------------------------------------------------------------------------
async function portraitSheet(): Promise<void> {
  const chars = allCharacters();
  const S = 128, pad = 16;
  size(chars.length * (S + pad) + pad, 40 + S + 64 + 60);
  label('L8 · getPortrait(id, 128) and (id, 64) on UI surfaces', 12, 26, 18);
  for (let i = 0; i < chars.length; i++) {
    const x = pad + i * (S + pad);
    ctx.fillStyle = i % 2 ? '#30302E' : '#F5F4ED'; ctx.fillRect(x, 40, S, S);
    const p = await getPortrait(chars[i]!.id, S);
    ctx.drawImage(p as CanvasImageSource, x, 40, S, S);
    ctx.fillStyle = '#D97757'; ctx.fillRect(x, 40 + S + 8, 64, 64);
    const p2 = await getPortrait(chars[i]!.id, 64);
    ctx.drawImage(p2 as CanvasImageSource, x, 40 + S + 8, 64, 64);
    label(chars[i]!.id, x, 40 + S + 90, 12);
  }
}

// --------------------------------------------------------------------------------------------------------------
async function oneSheet(r: THREE.WebGPURenderer): Promise<void> {
  const W = Number(q.get('w') ?? 900), H = Number(q.get('h') ?? 700);
  size(W, H);
  const scene = new THREE.Scene();
  createStudio(r, scene, { shadowSize: 2048 });
  const charId = q.get('char') ?? 'clay', kartId = q.get('kart');
  const yaw = (Number(q.get('yaw') ?? -35) * Math.PI) / 180;
  const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 26), W / H, 0.1, 100);
  let target = 0.62;
  if (kartId) {
    const k = mountKart(kartId, charId, liveryFor(kartId, Number(q.get('liv') ?? 0) as 0 | 1));
    scene.add(k.group);
    const sh = contactShadow(2, 2.4, 0.6); sh.position.y = 0.003; scene.add(sh);
    const emote = q.get('emote');
    poseKart(k, Number(q.get('steer') ?? 0.2));
    if (emote) { k.mascot.playEmote(emote as never); for (let i = 0; i < Number(q.get('et') ?? 20); i++) { k.group.updateMatrixWorld(true); k.mascot.setPose(idlePose, 1 / 30); } }
    target = 0.5;
  } else {
    const m = buildMascot(getCharacter(charId));
    m.setStance('stand');
    m.root.position.y = 0.51; scene.add(m.root);
    const sh = contactShadow(1.5, 1.1, 0.5); sh.position.y = 0.002; scene.add(sh);
    settle(m);
    const emote = q.get('emote');
    if (emote) { m.playEmote(emote as never); for (let i = 0; i < Number(q.get('et') ?? 20); i++) { m.root.updateMatrixWorld(true); m.setPose(idlePose, 1 / 30); } }
    const e = q.get('eyes'); if (e) { m.setEyes(e as never); m.setPose(idlePose, 0.01); }
  }
  const dist = Number(q.get('dist') ?? (kartId ? 6 : 3.4)), pitch = Number(q.get('pitch') ?? 0.2);
  cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, target + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(0, target, 0);
  await shoot(r, scene, cam, W, H, 0, 0);
}

main().catch((e) => { status.textContent = `error: ${String((e as Error)?.stack ?? e)}`; console.error(e); window.__sheetDone = true; });
