// Owns the single WebGPURenderer + canvas; switches between the lobby Showcase and a race Session.
import * as THREE from 'three/webgpu';
import { signal } from '@preact/signals';
import { createRenderer, type Backend } from '../render/engine/createRenderer.ts';
import { Showcase } from '../render/showcase/Showcase.ts';
import { pickTier, tierSettings, type QualityTier } from '../render/quality.ts';
import { save } from '../meta/save.ts';

export const stageInfo = signal<{ backend: Backend | '…'; tier: QualityTier; reason: string; fps: number }>({ backend: '…', tier: 'medium', reason: '', fps: 0 });

class StageImpl {
  renderer: THREE.WebGPURenderer | null = null;
  tier: QualityTier = 'medium';
  showcase: Showcase | null = null;
  private mode: 'none' | 'showcase' | 'race' = 'none';
  private raf = 0;
  private last = 0;
  private fpsAcc = 0; private fpsN = 0;

  async init(host: HTMLElement): Promise<void> {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const info = await createRenderer(canvas);
    const r = info.renderer;
    this.tier = pickTier(save.get().settings.quality, info.backend);
    const ts = tierSettings(this.tier);
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, ts.dprCap));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = ts.shadowSize > 0;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    stageInfo.value = { backend: info.backend, tier: this.tier, reason: info.reason, fps: 0 };
    (window as unknown as { __cr: Record<string, unknown> }).__cr = { ...(window as unknown as { __cr?: Record<string, unknown> }).__cr, backend: info.backend, tier: this.tier };
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.onResize?.(window.innerWidth, window.innerHeight);
  }
  onResize: ((w: number, h: number) => void) | null = null;

  showShowcase(characterId: string, kartBodyId: string): void {
    if (!this.renderer) return;
    if (!this.showcase) this.showcase = new Showcase(this.renderer);
    const lv = save.get().profile.livery;
    this.showcase.setLoadout(characterId, kartBodyId, lv);
    if (this.mode !== 'showcase') {
      this.mode = 'showcase';
      cancelAnimationFrame(this.raf);
      this.last = performance.now();
      const loop = (now: number): void => {
        if (this.mode !== 'showcase') return;
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
        this.fps(dt);
        this.showcase!.frame(dt);
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  enterRace(): void { this.mode = 'race'; cancelAnimationFrame(this.raf); }
  leaveRace(): void { this.mode = 'none'; }

  fps(dt: number): void {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 1) { stageInfo.value = { ...stageInfo.value, fps: Math.round(this.fpsN / this.fpsAcc) }; this.fpsAcc = 0; this.fpsN = 0; }
  }
}

export const Stage = new StageImpl();
