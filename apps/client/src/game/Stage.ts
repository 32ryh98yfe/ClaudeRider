// Owns the single WebGPURenderer + canvas; switches between the lobby Showcase and a race Session.
// Also: renderer output settings (ACES tone mapping, PCF shadows), the tier → audio panning choice,
// and the ?debug overlay with live budget counters.
import * as THREE from 'three/webgpu';
import { signal } from '@preact/signals';
import { createRenderer, type Backend } from '../render/engine/createRenderer.ts';
import { Showcase } from '../render/showcase/Showcase.ts';
import { navigate } from '../ui/store/route.ts';
import { isWarming, MaterialReveal } from '../render/engine/warm.ts';
import { pickTier, tierSettings, withUserPrefs, pixelRatioFor, FrameCap, setActiveBackend, deviceHints, type QualityTier, type TierSettings } from '../render/quality.ts';
import { TONE_MAPPING, ACES_EXPOSURE } from '../render/engine/tone.ts';
import { MaterialLibrary } from '../render/materials/library.ts';
import { Audio } from '../audio/engine.ts';
import { save } from '../meta/save.ts';

export const stageInfo = signal<{ backend: Backend | '…'; tier: QualityTier; reason: string; fps: number }>({ backend: '…', tier: 'medium', reason: '', fps: 0 });

class StageImpl {
  renderer: THREE.WebGPURenderer | null = null;
  tier: QualityTier = 'medium';
  showcase: Showcase | null = null;
  private reveal: MaterialReveal | null = null;
  private ts: TierSettings | null = null;
  /** Settings → frame cap, shared by the lobby loop and the race renderer. */
  readonly cap = new FrameCap();
  private mode: 'none' | 'showcase' | 'race' = 'none';
  private raf = 0;
  private last = 0;
  private fpsAcc = 0; private fpsN = 0;

  async init(host: HTMLElement): Promise<void> {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const info = await createRenderer(canvas);
    const r = info.renderer;
    setActiveBackend(info.backend);
    // a software (fallback) WebGPU adapter never gets Ultra on 'auto'
    const dev = (r.backend as unknown as { device?: { adapterInfo?: { isFallbackAdapter?: boolean } } }).device;
    this.tier = pickTier(save.get().settings.quality, info.backend, { ...deviceHints(), fallbackAdapter: dev?.adapterInfo?.isFallbackAdapter === true });
    const st = save.get().settings;
    const ts = withUserPrefs(tierSettings(this.tier), st);
    this.ts = ts;
    r.setPixelRatio(pixelRatioFor(ts, st));
    this.cap.cap = st.fpsCap ?? 60;
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.toneMapping = TONE_MAPPING;
    r.toneMappingExposure = ACES_EXPOSURE;
    r.shadowMap.enabled = ts.shadowSize > 0;
    // r186 WebGPURenderer dropped PCFSoftShadowMap (it warns and falls back); softness comes from shadow.radius / PCSS
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    MaterialLibrary.configure(this.tier);
    Audio.hrtf = this.tier !== 'low';
    stageInfo.value = { backend: info.backend, tier: this.tier, reason: info.reason, fps: 0 };
    (window as unknown as { __cr: Record<string, unknown> }).__cr = { ...(window as unknown as { __cr?: Record<string, unknown> }).__cr, backend: info.backend, tier: this.tier };
    window.addEventListener('resize', () => this.resize());
    // live Settings: render scale and frame cap apply at once; shadows / bloom / particles on the next scene build
    save.subscribe((sv) => {
      if (!this.renderer || !this.ts) return;
      const pr = pixelRatioFor(this.ts, sv.settings);
      if (Math.abs(pr - this.renderer.getPixelRatio()) > 1e-3) { this.renderer.setPixelRatio(pr); this.resize(); }
      this.cap.cap = sv.settings.fpsCap ?? 60;
    });
    const q = new URLSearchParams(location.search);
    if (q.has('debug')) void import('../dev/overlay.ts').then((m) => m.installOverlay());
    // dev shortcut for visual checks: ?race=<trackId>[&mode=item&tier=pro] jumps straight into a race
    if (q.has('race')) setTimeout(() => { navigate('loading', { track: q.get('race')!, mode: q.get('mode') ?? 'speed', tier: q.get('tier') ?? 'racer' }); }, 300);
  }

  resize(): void {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.onResize?.(window.innerWidth, window.innerHeight);
  }
  onResize: ((w: number, h: number) => void) | null = null;

  showShowcase(characterId: string, kartBodyId: string): void {
    if (!this.renderer) return;
    const first = !this.showcase;
    if (!this.showcase) this.showcase = new Showcase(this.renderer, { env: this.tier !== 'low' });
    const lv = save.get().profile.livery;
    this.showcase.setLoadout(characterId, kartBodyId, lv);
    // Low (software GL in CI): every program link blocks for up to seconds, and the first showcase frame needs ~30 of
    // them. Reveal the scene one material per frame so the title and menus keep handling input while it fills in.
    if (first && this.tier === 'low') this.reveal = new MaterialReveal(this.showcase.scene);
    if (this.mode !== 'showcase') {
      this.mode = 'showcase';
      cancelAnimationFrame(this.raf);
      this.last = performance.now();
      const loop = (now: number): void => {
        if (this.mode !== 'showcase') return;
        this.raf = requestAnimationFrame(loop);
        if (isWarming()) { this.last = now; return; }
        if (!this.cap.ready(now)) return;
        const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
        this.fps(dt);
        this.renderer!.info.reset();
        this.showcase!.frame(dt);
        if (this.reveal && this.reveal.step(1)) this.reveal = null;
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  enterRace(): void { this.reveal?.finish(); this.reveal = null; this.mode = 'race'; cancelAnimationFrame(this.raf); }
  leaveRace(): void { this.mode = 'none'; }

  fps(dt: number): void {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 1) { stageInfo.value = { ...stageInfo.value, fps: Math.round(this.fpsN / this.fpsAcc) }; this.fpsAcc = 0; this.fpsN = 0; }
  }
}

export const Stage = new StageImpl();
