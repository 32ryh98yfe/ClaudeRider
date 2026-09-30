// Owns the single WebGPURenderer + canvas; switches between the lobby Showcase and a race Session.
// Also: renderer output settings (Neutral tone mapping, soft PCF shadows), the tier → audio panning choice,
// and the ?debug overlay with live budget counters.
import * as THREE from 'three/webgpu';
import { signal } from '@preact/signals';
import { createRenderer, type Backend } from '../render/engine/createRenderer.ts';
import { Showcase } from '../render/showcase/Showcase.ts';
import { pickTier, tierSettings, type QualityTier } from '../render/quality.ts';
import { MaterialLibrary } from '../render/materials/library.ts';
import { Audio } from '../audio/engine.ts';
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
    r.shadowMap.type = this.tier === 'low' || this.tier === 'medium' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer = r;
    MaterialLibrary.configure(this.tier);
    Audio.hrtf = this.tier !== 'low';
    stageInfo.value = { backend: info.backend, tier: this.tier, reason: info.reason, fps: 0 };
    (window as unknown as { __cr: Record<string, unknown> }).__cr = { ...(window as unknown as { __cr?: Record<string, unknown> }).__cr, backend: info.backend, tier: this.tier };
    window.addEventListener('resize', () => this.resize());
    const q = new URLSearchParams(location.search);
    if (q.has('debug')) void import('../dev/overlay.ts').then((m) => m.installOverlay());
    // dev shortcut for visual checks: ?race=<trackId>[&mode=item&tier=pro] jumps straight into a race
    if (q.has('race')) setTimeout(() => { void import('../ui/store/route.ts').then((r) => r.navigate('loading', { track: q.get('race')!, mode: q.get('mode') ?? 'speed', tier: q.get('tier') ?? 'racer' })); }, 300);
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
        this.renderer!.info.reset();
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
