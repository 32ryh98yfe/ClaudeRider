// BudgetTracker (40-perf-budgets.md §6): per-frame draw calls / triangles (all passes, incl. shadows and post),
// unique materials in the scene, memory, and frame-phase timings (p50/p95 over 300 frames).
// Published on window.__cr.budget for the dev overlay and the e2e perf suite. Never changes gameplay.
import type * as THREE from 'three/webgpu';
import type { QualityTier, TierSettings } from '../quality.ts';

export interface BudgetSnapshot {
  tier: QualityTier;
  drawCalls: number; triangles: number; uniqueMaterials: number; libraryMaterials: number;
  textures: number; geometries: number; textureBytes: number; geometryBytes: number;
  frameMs: { p50: number; p95: number }; jsUpdateMs: { p50: number; p95: number }; renderSubmitMs: { p50: number; p95: number };
  resScale: number; fps: number; frames: number; lastSubmitMs: number;
  budget: { draws: number; tris: number; materials: number };
  over: { draws: boolean; tris: boolean; materials: boolean };
  maxDrawCalls: number; maxTriangles: number;
}

const N = 300;

class Ring {
  private a = new Float32Array(N); private n = 0; private i = 0; private sorted = new Float32Array(N);
  push(v: number): void { this.a[this.i] = v; this.i = (this.i + 1) % N; if (this.n < N) this.n++; }
  pct(out: { p50: number; p95: number }): void {
    if (!this.n) { out.p50 = out.p95 = 0; return; }
    const s = this.sorted.subarray(0, this.n);
    s.set(this.a.subarray(0, this.n));
    s.sort();
    out.p50 = s[Math.floor(this.n * 0.5)]!; out.p95 = s[Math.min(this.n - 1, Math.floor(this.n * 0.95))]!;
  }
  p90(): number {
    if (!this.n) return 0;
    const s = this.sorted.subarray(0, this.n);
    s.set(this.a.subarray(0, this.n)); s.sort();
    return s[Math.min(this.n - 1, Math.floor(this.n * 0.9))]!;
  }
  count(): number { return this.n; }
  reset(): void { this.n = 0; this.i = 0; }
}

export class BudgetTracker {
  readonly snap: BudgetSnapshot;
  private frame = new Ring(); private js = new Ring(); private submit = new Ring();
  private t0 = 0; private tUpd = 0; private tSub = 0; private lastFrameStart = 0;
  private frames = 0;
  private mats = new Set<THREE.Material>();
  private warned = false;
  private libCount: () => number;
  private renderer: THREE.WebGPURenderer;
  resScale = 1;

  constructor(renderer: THREE.WebGPURenderer, tier: QualityTier, ts: TierSettings, libCount: () => number) {
    this.renderer = renderer; this.libCount = libCount;
    renderer.info.autoReset = false; // RenderPipeline renders several passes per frame; we reset once per frame
    this.snap = {
      tier, drawCalls: 0, triangles: 0, uniqueMaterials: 0, libraryMaterials: 0, textures: 0, geometries: 0, textureBytes: 0, geometryBytes: 0,
      frameMs: { p50: 0, p95: 0 }, jsUpdateMs: { p50: 0, p95: 0 }, renderSubmitMs: { p50: 0, p95: 0 }, resScale: 1, fps: 0, frames: 0, lastSubmitMs: 0,
      budget: { draws: ts.drawBudget, tris: ts.triBudget, materials: ts.materialBudget },
      over: { draws: false, tris: false, materials: false }, maxDrawCalls: 0, maxTriangles: 0,
    };
    const w = window as unknown as { __cr?: Record<string, unknown> };
    w.__cr = { ...w.__cr, budget: this.snap };
  }

  /** Call at the start of a frame, before any update work. */
  beginFrame(now: number): void {
    if (this.lastFrameStart > 0) this.frame.push(now - this.lastFrameStart);
    this.lastFrameStart = now;
    this.t0 = now;
    this.renderer.info.reset();
  }
  /** Call after the JS update work (sim, systems), right before render submission. */
  markUpdated(now: number): void { this.tUpd = now; this.js.push(now - this.t0); }
  /** Call after RenderPipeline.render(). `scene` is traversed for unique materials every 60 frames. */
  endFrame(now: number, scene: THREE.Object3D | null): void {
    this.tSub = now; this.submit.push(this.tSub - this.tUpd);
    const r = this.renderer.info.render;
    const s = this.snap;
    s.drawCalls = r.drawCalls; s.triangles = r.triangles;
    if (this.frames > 30) { s.maxDrawCalls = Math.max(s.maxDrawCalls, r.drawCalls); s.maxTriangles = Math.max(s.maxTriangles, r.triangles); }
    s.resScale = this.resScale;
    if (scene && this.frames % 60 === 0) this.countMaterials(scene);
    if (this.frames % 30 === 0) {
      this.frame.pct(s.frameMs); this.js.pct(s.jsUpdateMs); this.submit.pct(s.renderSubmitMs);
      s.fps = s.frameMs.p50 > 0 ? Math.round(1000 / s.frameMs.p50) : 0;
      const mem = this.renderer.info.memory as unknown as Record<string, number>;
      s.textures = mem['textures'] ?? 0; s.geometries = mem['geometries'] ?? 0;
      s.textureBytes = mem['texturesSize'] ?? 0; s.geometryBytes = (mem['attributesSize'] ?? 0) + (mem['indexAttributesSize'] ?? 0);
      s.libraryMaterials = this.libCount();
      s.over.draws = s.drawCalls > s.budget.draws; s.over.tris = s.triangles > s.budget.tris; s.over.materials = s.uniqueMaterials > s.budget.materials;
    }
    this.frames++;
    s.frames = this.frames; s.lastSubmitMs = this.tSub - this.tUpd;
  }

  /** p90 frame time (ms) over the recorded window: drives dynamic resolution. */
  frameP90(): number { return this.frame.p90(); }
  frameSamples(): number { return this.frame.count(); }
  resetFrameWindow(): void { this.frame.reset(); }

  countMaterials(scene: THREE.Object3D): number {
    const set = this.mats; set.clear();
    const names: string[] = [];
    scene.traverseVisible((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      if (Array.isArray(m)) { for (const x of m) if (!set.has(x)) { set.add(x); names.push(x.name || x.type); } }
      else if (!set.has(m)) { set.add(m); names.push(m.name || m.type); }
    });
    this.snap.uniqueMaterials = set.size;
    this.snap.over.materials = set.size > this.snap.budget.materials;
    if (set.size > this.snap.budget.materials && !this.warned) {
      this.warned = true;
      console.warn(`[budget] ${set.size} unique materials in the scene (budget ${this.snap.budget.materials}):`, names.join(', '));
    }
    return set.size;
  }
}
