// Character portraits (HUD standings, character select, room slots): an offscreen head render, cached per
// (character, size, body colour). See docs/design/contract-requests/L8-portraits.md.
//
// Rendering uses a small dedicated WebGL2-backend WebGPURenderer on a detached canvas, so portraits never disturb the
// main renderer's state, size or render targets, and the result can be copied synchronously with drawImage. The
// portrait is rendered at 2× and downsampled for clean edges; the background is transparent so UI surfaces show through.
import * as THREE from 'three/webgpu';
import { buildMascot } from '../mascot/rig.ts';
import { getCharacter } from '../characters/registry.ts';

export interface PortraitOptions {
  /** Garage palette skin (body colour) or undefined for the default. */
  bodyColor?: string;
  /** Eye expression for the portrait (default 'open'; results screens may want 'happy'). */
  eyes?: 'open' | 'happy' | 'star' | 'angry' | 'dizzy' | 'sleepy' | 'wink';
  /** Yaw of the head in degrees (default −20: a friendly three-quarter view). */
  yawDeg?: number;
}

type Out = ImageBitmap | HTMLCanvasElement;
const cache = new Map<string, Promise<Out>>();
let shared: THREE.WebGPURenderer | null = null;
let own: Promise<THREE.WebGPURenderer> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const MAX = 512;

/**
 * Optional: hand an existing renderer to the portrait system (the contact sheet does). By default portraits create
 * their own small WebGL2-backend renderer lazily on first use.
 */
export function setPortraitRenderer(r: THREE.WebGPURenderer | null): void { shared = r; }

async function portraitRenderer(): Promise<THREE.WebGPURenderer> {
  if (shared) return shared;
  if (!own) {
    own = (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const r = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: true });
      await r.init();
      r.setPixelRatio(1);
      r.toneMapping = THREE.NeutralToneMapping;
      r.setClearColor(0x000000, 0);
      return r;
    })();
  }
  return own;
}

function portraitScene(characterId: string, o: PortraitOptions): { scene: THREE.Scene; cam: THREE.PerspectiveCamera; dispose(): void } {
  const scene = new THREE.Scene();
  const m = buildMascot(getCharacter(characterId));
  m.setLod(0);
  m.setStance('stand');
  if (o.bodyColor) m.setBodyColor(o.bodyColor);
  m.setEyes(o.eyes ?? 'open');
  const yaw = THREE.MathUtils.degToRad(o.yawDeg ?? -20);
  m.root.rotation.y = yaw;
  scene.add(m.root);
  for (let i = 0; i < 20; i++) { m.root.updateMatrixWorld(true); m.setPose({ steer: 0, lean: 0, speed01: 0, drifting: false, boosting: false, airborne: false, hit: 0 }, 1 / 30); }
  m.root.updateMatrixWorld(true);
  // lights: warm key, cool rim, soft fill — same language as the lobby studio
  const key = new THREE.DirectionalLight('#fff0e2', 2.8); key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight('#a9d8ff', 2.4); rim.position.set(-3, 2, -3);
  const rim2 = new THREE.DirectionalLight('#ffc9a8', 1.4); rim2.position.set(3, 1.5, -3);
  scene.add(key, rim, rim2, new THREE.HemisphereLight('#fff4ea', '#6b4a3a', 1.2));
  // frame the head (body + head accessory): fit the vinyl bounds above the arms
  const box = new THREE.Box3().setFromObject(m.root, true);
  // head-and-shoulders crop: from just under the arms to the accessory top, so the eyes stay big at 48–64 px
  const top = Math.min(box.max.y, 1.2), bottom = -0.2;
  const cy = (top + bottom) / 2, h = Math.max(0.95, top - bottom);
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 50);
  const dist = (h * 0.56) / Math.tan(THREE.MathUtils.degToRad(11)) + 0.3;
  cam.position.set(0, cy + 0.14, dist);
  cam.lookAt(0, cy, 0);
  return { scene, cam, dispose: () => m.dispose() };
}

async function render(characterId: string, sizePx: number, o: PortraitOptions): Promise<Out> {
  const r = await portraitRenderer();
  const s = Math.min(MAX, Math.max(16, Math.round(sizePx)));
  const px = Math.min(MAX, s * 2);
  const { scene, cam, dispose } = portraitScene(characterId, o);
  const prevSize = new THREE.Vector2(); r.getSize(prevSize);
  const prevClear = new THREE.Color(); r.getClearColor(prevClear); const prevAlpha = r.getClearAlpha();
  r.setClearColor(0x000000, 0);
  r.setSize(px, px, false);
  await r.compileAsync(scene, cam);
  r.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(r.domElement, 0, 0, px, px, 0, 0, s, s);
  if (r === shared) { r.setSize(prevSize.x, prevSize.y, false); r.setClearColor(prevClear, prevAlpha); }
  dispose();
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(out); } catch { /* fall back to the canvas */ } }
  return out;
}

/**
 * Head portrait of a character, `sizePx` square, transparent background. Cached; concurrent calls are serialized.
 * Unknown ids fall back to the placeholder character (never throws for a missing definition).
 */
export function getPortrait(characterId: string, sizePx: number, o: PortraitOptions = {}): Promise<ImageBitmap | HTMLCanvasElement> {
  const key = `${characterId}|${Math.round(sizePx)}|${o.bodyColor ?? ''}|${o.eyes ?? ''}|${o.yawDeg ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    p = queue.then(() => render(characterId, sizePx, o));
    queue = p.catch(() => undefined);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Drop cached portraits (e.g. after a palette-skin purchase). */
export function clearPortraitCache(): void { cache.clear(); }
