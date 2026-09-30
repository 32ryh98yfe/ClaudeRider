// Shader warm-up helpers. SwiftShader (the headless / CPU fallback) has no KHR_parallel_shader_compile, so every
// program link blocks the main thread, often for 0.2–3 s. `renderer.compileAsync()` yields to the event loop between
// objects, which keeps loading screens and menus responsive, but it must run in the same context as the real pass:
// the same MRT outputs and a non-canvas render target. Otherwise it builds a second set of programs that the frame
// never uses. The WebGL backend keys programs by shader source alone, so the first real frame reuses these programs.
import * as THREE from 'three/webgpu';
import { mrt, output, emissive } from 'three/tsl';

type N = any;

let active = 0;
/** True while a warm-up has the renderer's render target / MRT borrowed: other loops must skip rendering. */
export function isWarming(): boolean { return active > 0; }
/** Runs an async compile with the renderer's target and MRT set to `rt` / `mrtNode`, restoring both afterwards. */
export async function compileInContext(renderer: THREE.WebGPURenderer, rt: THREE.RenderTarget, mrtNode: N, run: () => Promise<void>): Promise<void> {
  const prevRT = renderer.getRenderTarget(), prevMRT = renderer.getMRT();
  active++;
  renderer.setRenderTarget(rt);
  renderer.setMRT(mrtNode);
  try { await run(); } finally {
    renderer.setRenderTarget(prevRT);
    renderer.setMRT(prevMRT);
    active--;
  }
}

/** Runs `fn` with every non-light object in `scene` visible and unculled, so pooled and off-screen meshes compile too. */
export async function withEverythingVisible(scene: THREE.Object3D, fn: () => Promise<void> | void): Promise<void> {
  finishReveals(); // shared materials hidden by a lobby reveal would otherwise be skipped
  const shown: THREE.Object3D[] = [], unculled: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (!o.visible && !(o as THREE.Light).isLight) { o.visible = true; shown.push(o); }
    if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); }
  });
  try { await fn(); } finally {
    for (const o of shown) o.visible = false;
    for (const o of unculled) o.frustumCulled = true;
  }
}

/**
 * Compiles `scene` for a pass that renders into an RGBA16F target with the MRT outputs `names`. The default
 * (`output`, `emissive`) is the layout used by the race post chain and by the lobby Showcase.
 */
export async function warmPassPrograms(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, names: string[] = ['output', 'emissive'], mrtNode: N = null): Promise<void> {
  const rt = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType });
  rt.texture.name = names[0] ?? 'output';
  const depth = new THREE.DepthTexture(1, 1);
  depth.isRenderTargetTexture = true;
  depth.name = 'depth';
  rt.depthTexture = depth;
  for (const n of names.slice(1)) { const t = rt.texture.clone(); t.name = n; rt.textures.push(t); }
  try {
    await compileInContext(renderer, rt, mrtNode ?? mrt({ output, emissive }), () => withEverythingVisible(scene, () => renderer.compileAsync(scene, camera)));
  } finally { rt.dispose(); }
}

/**
 * Hides every material of a scene, then shows them back a few per frame. A cold start then links its shaders over
 * many short frames instead of one frozen frame, so menus stay responsive on software GL (the lobby showcase on
 * Low). Materials are shared across scenes: `finish()` must run before anything else renders them.
 */
const reveals = new Set<MaterialReveal>();
/** Makes every material hidden by a pending reveal visible again (before a race builds or warms its scene). */
export function finishReveals(): void { for (const r of [...reveals]) r.finish(); }

export class MaterialReveal {
  private queue: THREE.Material[] = [];
  private hidden = new Set<THREE.Material>();

  constructor(scene: THREE.Object3D) {
    reveals.add(this);
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) if (x.visible && !this.hidden.has(x)) { x.visible = false; this.hidden.add(x); this.queue.push(x); }
    });
  }

  get done(): boolean { return this.queue.length === 0; }

  /** Shows the next `n` materials; returns true once every material is visible again. */
  step(n = 1): boolean {
    for (let i = 0; i < n && this.queue.length; i++) { const m = this.queue.shift()!; m.visible = true; this.hidden.delete(m); }
    if (this.done) reveals.delete(this);
    return this.done;
  }

  finish(): void { for (const m of this.queue) m.visible = true; this.queue.length = 0; this.hidden.clear(); reveals.delete(this); }
}
