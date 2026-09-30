// Renderer factory with backend selection + trial render + persistent fallback (ADR-002).
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { save } from '../../meta/save.ts';

export type Backend = 'webgpu' | 'webgl2';
export interface RendererInfo { renderer: THREE.WebGPURenderer; backend: Backend; reason: string }

const LS_KEY = 'cr.renderer.backend';

function wanted(): 'auto' | Backend {
  const q = new URLSearchParams(location.search).get('renderer');
  if (q === 'webgl2' || q === 'webgpu') return q;
  const s = save.get().settings.renderer;
  if (s !== 'auto') return s;
  try {
    const cached = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as { ua: string; backend: Backend } | null;
    if (cached && cached.ua === navigator.userAgent) return cached.backend;
  } catch { /* ignore */ }
  return 'auto';
}

async function tryCreate(forceWebGL: boolean, canvas: HTMLCanvasElement): Promise<THREE.WebGPURenderer> {
  const r = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL, powerPreference: 'high-performance', alpha: false });
  await r.init();
  return r;
}

/** Renders one tiny frame through a RenderPipeline; throws if the backend is broken. */
async function trial(r: THREE.WebGPURenderer): Promise<void> {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial()));
  const pipe = new THREE.RenderPipeline(r);
  pipe.outputNode = pass(scene, cam);
  let err: unknown = null;
  const backend = r.backend as unknown as { device?: GPUDevice };
  const dev = backend.device;
  const onErr = (e: Event): void => { err = (e as unknown as { error: unknown }).error ?? e; };
  dev?.addEventListener?.('uncapturederror', onErr);
  const prevSize = new THREE.Vector2();
  r.getSize(prevSize);
  r.setSize(2, 2, false);
  pipe.render();
  await new Promise((res) => setTimeout(res, 50));
  dev?.removeEventListener?.('uncapturederror', onErr);
  pipe.dispose();
  r.setSize(Math.max(1, prevSize.x), Math.max(1, prevSize.y), false);
  if (err) throw err instanceof Error ? err : new Error(String(err));
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererInfo> {
  const want = wanted();
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  if ((want === 'auto' || want === 'webgpu') && hasWebGPU) {
    try {
      const r = await tryCreate(false, canvas);
      const isGpu = (r.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
      if (isGpu) {
        await trial(r);
        remember('webgpu');
        return { renderer: r, backend: 'webgpu', reason: 'webgpu ok' };
      }
      remember('webgl2');
      return { renderer: r, backend: 'webgl2', reason: 'webgpu unavailable; three fell back to webgl2' };
    } catch (e) {
      console.warn('[renderer] WebGPU failed, falling back to WebGL2:', e);
      // a fresh canvas is required after a failed WebGPU context
      const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(fresh);
      const r = await tryCreate(true, fresh);
      remember('webgl2');
      return { renderer: r, backend: 'webgl2', reason: `webgpu error: ${(e as Error)?.message ?? e}` };
    }
  }
  const r = await tryCreate(true, canvas);
  return { renderer: r, backend: 'webgl2', reason: want === 'webgl2' ? 'forced webgl2' : 'no navigator.gpu' };
}

function remember(b: Backend): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ua: navigator.userAgent, backend: b })); } catch { /* ignore */ }
}
