// Lobby / title / results 3D showcase: the player's Clawd in its kart on a glossy turntable inside a seamless studio
// cyclorama (no horizon line), soft key + rim lights, contact shadow, a subtle planar reflection on the turntable,
// idle/emote cycling with emote FX, and a pop transition whenever the loadout changes.
import * as THREE from 'three/webgpu';
import { color, mix, pass, renderOutput, mrt, output, emissive, reflector, positionWorld, smoothstep, float, vec3 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { buildMascot, RIG, type MascotInstance, type EmoteSlot } from '../mascot/rig.ts';
import { getCharacter } from '../characters/registry.ts';
import { getKartBody } from '../karts/registry.ts';
import type { KartModel, Livery } from '../karts/types.ts';
import { createStudio, contactShadow, type Studio } from './studio.ts';
import { ParticlePool } from '../vfx/particles.ts';
// registers getPortrait() as the art-slot fallback for portrait.<id> (side effect, lazy: renders on first request)
import '../portrait/register.ts';

interface Loadout {
  key: string; charId: string; kartId: string; livery: Livery;
  kart: KartModel; mascot: MascotInstance; group: THREE.Group;
  age: number; leaving: number; // leaving < 0 = present
}

/** Emote FX palettes (colour sets per cue). */
const FX: Record<string, { colors: string[]; n: number; up: number; spread: number; life: number; size: number; soft?: boolean; gravity?: number }> = {
  confetti: { colors: ['#D97757', '#FFD23F', '#6A9BCC', '#7BD88F', '#FAF9F5', '#FF9EC7'], n: 46, up: 4.2, spread: 2.2, life: 1.6, size: 0.07 },
  sparkle: { colors: ['#FFF6E0', '#FFD9A8', '#FFFFFF'], n: 26, up: 2.2, spread: 1.4, life: 0.9, size: 0.09 },
  stars: { colors: ['#FFD23F', '#FFF3C4'], n: 14, up: 1.6, spread: 1.6, life: 0.9, size: 0.1 },
  coins: { colors: ['#F2C14E', '#E0B04B', '#FFE08A'], n: 24, up: 4.0, spread: 1.6, life: 1.3, size: 0.08 },
  hearts: { colors: ['#FF7A9A', '#FF9EC7', '#E5484D'], n: 14, up: 1.4, spread: 0.8, life: 1.4, size: 0.1, gravity: 1.5 },
  steam: { colors: ['#F4F1EA', '#E6E2DA'], n: 14, up: 1.6, spread: 0.5, life: 1.3, size: 0.22, soft: true, gravity: 1.2 },
  smoke: { colors: ['#6E6C68', '#8E8B86', '#3E3C3A'], n: 24, up: 0.9, spread: 1.4, life: 1.0, size: 0.3, soft: true, gravity: 0.6 },
  snow: { colors: ['#FFFFFF', '#DFF4FF', '#BEE9F7'], n: 34, up: 2.6, spread: 2.0, life: 1.6, size: 0.07 },
  breath: { colors: ['#F2FAFF'], n: 8, up: 0.6, spread: 0.4, life: 1.1, size: 0.2, soft: true, gravity: 0.4 },
  squares: { colors: ['#D87656', '#F9F8F4', '#8B8B8B'], n: 20, up: 3.0, spread: 1.6, life: 1.0, size: 0.08 },
  glitch: { colors: ['#2EF2FF', '#FF3EA5', '#FF7A50'], n: 26, up: 1.8, spread: 2.2, life: 0.6, size: 0.08 },
  firework: { colors: ['#B57CFF', '#FFD23F', '#2EF2FF', '#FFF6E0'], n: 36, up: 3.4, spread: 2.6, life: 1.1, size: 0.08 },
  planet: { colors: ['#6A9BCC', '#F5F4ED', '#FFD23F'], n: 24, up: 1.2, spread: 1.8, life: 1.6, size: 0.09, gravity: 0.2 },
  sweat: { colors: ['#9FD3F5', '#6A9BCC'], n: 6, up: 1.4, spread: 0.8, life: 0.8, size: 0.07 },
  sigh: { colors: ['#F2EFEA'], n: 6, up: 0.5, spread: 0.3, life: 1.2, size: 0.18, soft: true, gravity: 0.3 },
  feathers: { colors: ['#3FA34D', '#E5484D', '#F2C14E'], n: 12, up: 1.6, spread: 1.4, life: 1.2, size: 0.08, gravity: -2 },
  flour: { colors: ['#FFFFFF', '#F5F0E6'], n: 22, up: 1.2, spread: 1.6, life: 1.0, size: 0.16, soft: true, gravity: 0.2 },
  bolts: { colors: ['#9A9A9A', '#5A5A5A', '#C9A14A'], n: 10, up: 2.4, spread: 1.4, life: 0.9, size: 0.06 },
};

const IDLE_CYCLE: EmoteSlot[] = ['lobby', 'idle', 'podium', 'idle', 'win', 'idle', 'attackLanded', 'idle'];
const easeOutBack = (x: number): number => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeInBack = (x: number): number => { const c1 = 1.70158; return (c1 + 1) * x * x * x - c1 * x * x; };
const liveryKey = (l: Livery): string => `${l.primary}|${l.secondary}|${l.pattern}|${l.number}`;

export class Showcase {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  /** Horizontal subject offset in "panel widths" (−1 = left of centre); eased toward. */
  offsetX = 0.9;
  private offS = NaN;
  private turntable = new THREE.Group();
  private disc: THREE.Mesh;
  private studio: Studio;
  private current: Loadout | null = null;
  private leaving: Loadout[] = [];
  private pipe: THREE.RenderPipeline;
  private renderer: THREE.WebGPURenderer;
  private sparks = new ParticlePool(220, { additive: true });
  private puffs = new ParticlePool(160, { additive: false, soft: true });
  private t = 0;
  private cycleT = 5;
  private cycleI = 0;
  private tmpV = new THREE.Vector3();
  private tmpC = new THREE.Color();

  constructor(renderer: THREE.WebGPURenderer, opts: { reflections?: boolean; env?: boolean } = {}) {
    this.renderer = renderer;
    const s = this.scene;
    s.background = new THREE.Color('#2a1d17');
    // env: false (Low, via Stage) skips the PMREM studio environment: on software GL its cube render + blur passes
    // cost ~10 s at boot (L11-showcase-lowtier.md)
    this.studio = createStudio(renderer, s, { shadowSize: 2048, env: opts.env ?? true });
    // glossy ivory turntable; the top carries a faint planar reflection that fades toward the rim
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const reflect = opts.reflections ?? !(q?.get('quality') === 'low' || q?.get('reflect') === '0');
    const discMat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
    const r = positionWorld.xz.length();
    const base = mix(color('#fbf7f0'), color('#e9dccd'), smoothstep(1.2, 2.2, r));
    if (reflect) {
      const refl = reflector({ resolutionScale: 0.5, bounces: false });
      refl.target.rotateX(-Math.PI / 2);
      refl.target.position.y = 0.121;
      s.add(refl.target);
      discMat.colorNode = mix(base, refl.rgb, float(0.16).mul(smoothstep(2.1, 0.4, r)));
    } else discMat.colorNode = base;
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.16, 0.12, 72), discMat);
    this.disc.position.y = 0.06; this.disc.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.13, 0.018, 6, 96), new THREE.MeshPhysicalNodeMaterial({ color: '#d97757', roughness: 0.3, clearcoat: 1 }));
    (rim.material as THREE.MeshPhysicalNodeMaterial).emissiveNode = vec3(0.85, 0.47, 0.34).mul(0.35);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.105;
    s.add(this.disc, rim, this.turntable);
    this.sparks.gravity = -4.5; this.sparks.drag = 1.2;
    this.puffs.gravity = -3; this.puffs.drag = 1.6;
    s.add(this.sparks.mesh, this.puffs.mesh);
    this.camera.position.set(0, 2.0, 6.8);
    this.camera.lookAt(0, 0.78, 0);
    this.pipe = new THREE.RenderPipeline(renderer);
    const sp = pass(s, this.camera);
    sp.setMRT(mrt({ output, emissive }));
    this.pipe.outputColorTransform = false;
    this.pipe.outputNode = fxaa(renderOutput(sp.getTextureNode('output').add(bloom(sp.getTextureNode('emissive'), 0.55, 0.4, 0))));
  }

  /** Show a loadout. Same loadout → no-op; livery-only change → repaint in place with a hop; else pop transition. */
  setLoadout(characterId: string, kartBodyId: string, livery: Livery): void {
    const key = `${characterId}|${kartBodyId}`;
    const cur = this.current;
    if (cur && cur.key === key) {
      if (liveryKey(cur.livery) !== liveryKey(livery)) {
        if (Math.round(cur.livery.number) === Math.round(livery.number)) { cur.kart.setLivery(livery); cur.livery = { ...livery }; cur.mascot.playEmote('attackLanded'); return; }
      } else return;
    }
    if (cur) { cur.leaving = 0; this.leaving.push(cur); }
    const kart = getKartBody(kartBodyId).build(livery);
    kart.setLod(0);
    const mascot = buildMascot(getCharacter(characterId));
    mascot.setLod(0);
    mascot.root.scale.setScalar(RIG.seatScale);
    kart.seat.add(mascot.root);
    mascot.onFx = (name, at) => this.fx(name, at);
    const group = new THREE.Group();
    group.add(kart.root);
    const d = getKartBody(kartBodyId).dims;
    const sh = contactShadow(d.width * 1.55, d.length * 1.3, 0.62);
    sh.position.y = 0.003;
    group.add(sh);
    group.position.y = 0.12;
    group.scale.setScalar(0.001);
    this.turntable.add(group);
    this.current = { key, charId: characterId, kartId: kartBodyId, livery: { ...livery }, kart, mascot, group, age: cur ? -0.14 : 0, leaving: -1 };
    this.cycleT = 7;
  }

  /** Play an emote on the current driver (results screen: 'win' for podium finishes). */
  emote(e: EmoteSlot = 'win'): void { this.current?.mascot.playEmote(e); this.cycleT = 8; }

  private fx(name: string, at: THREE.Object3D): void {
    const f = FX[name];
    if (!f) return;
    at.getWorldPosition(this.tmpV);
    const pool = f.soft ? this.puffs : this.sparks;
    for (let i = 0; i < f.n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * f.spread;
      this.tmpC.set(f.colors[i % f.colors.length]!);
      pool.spawn(this.tmpV.x, this.tmpV.y + 0.15, this.tmpV.z, Math.cos(a) * s, f.up * (0.6 + Math.random() * 0.6), Math.sin(a) * s, f.life * (0.7 + Math.random() * 0.5), f.size * (0.7 + Math.random() * 0.6), this.tmpC);
    }
  }

  frame(dtIn: number): void {
    const dt = Math.min(0.1, Math.max(0, dtIn));
    this.t += dt;
    this.turntable.rotation.y = -0.55 + Math.sin(this.t * 0.32) * 0.5;
    // loadout transitions: the old kart shrinks out with a spin, the new one pops in with overshoot
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const L = this.leaving[i]!;
      L.leaving += dt;
      const k = Math.min(1, L.leaving / 0.24);
      L.group.scale.setScalar(Math.max(0.001, 1 - easeInBack(k)));
      L.group.rotation.y += dt * 9 * k;
      if (k >= 1) { this.turntable.remove(L.group); L.kart.dispose(); L.mascot.dispose(); this.leaving.splice(i, 1); }
    }
    const cur = this.current;
    if (cur) {
      const before = cur.age;
      cur.age += dt;
      if (cur.age > 0) {
        const k = Math.min(1, cur.age / 0.5);
        cur.group.scale.setScalar(1.55 * Math.max(0.001, easeOutBack(k)));
        cur.group.position.y = 0.12 + Math.sin(Math.min(1, cur.age / 0.5) * Math.PI) * 0.18;
      }
      if (before <= 0.35 && cur.age > 0.35) cur.mascot.playEmote('lobby');
      // idle ↔ emote cycling (only between emotes)
      this.cycleT -= dt;
      if (this.cycleT <= 0 && !cur.mascot.emote) { cur.mascot.playEmote(IDLE_CYCLE[this.cycleI++ % IDLE_CYCLE.length]!); this.cycleT = 6 + Math.random() * 3; }
      const steer = Math.sin(this.t * 0.8) * 0.28;
      cur.group.updateMatrixWorld();
      cur.mascot.setPose({ steer, lean: 0, speed01: 0.04, drifting: false, boosting: false, airborne: false, hit: 0 }, dt);
      cur.kart.update({ steer, wheelSpin: 0, boost: 0, drift: false, speed: 0 }, dt);
    }
    for (const L of this.leaving) { L.mascot.setPose({ steer: 0, lean: 0, speed01: 0, drifting: false, boosting: false, airborne: false, hit: 1 }, dt); L.kart.update({ steer: 0, wheelSpin: 0, boost: 0, drift: false, speed: 0 }, dt); }
    this.sparks.update(dt, this.camera);
    this.puffs.update(dt, this.camera);
    // camera: gentle breathing dolly + eased panel offset
    // snap on the first frame (the owning screen sets offsetX right after construction), ease afterwards
    this.offS = Number.isNaN(this.offS) ? this.offsetX : this.offS + (this.offsetX - this.offS) * (1 - Math.exp(-5 * dt));
    const el = this.renderer.domElement, w = el.clientWidth || el.width, h = el.clientHeight || el.height;
    this.camera.position.set(Math.sin(this.t * 0.11) * 0.15, 2.0 + Math.sin(this.t * 0.17) * 0.05, 6.8);
    this.camera.lookAt(0, 0.78, 0);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.setViewOffset(w, h, -w * 0.18 * this.offS, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.pipe.render();
  }

  dispose(): void {
    this.pipe.dispose();
    for (const L of [...this.leaving, ...(this.current ? [this.current] : [])]) { L.kart.dispose(); L.mascot.dispose(); }
    this.leaving = []; this.current = null;
    this.studio.dispose();
    this.scene.clear();
  }
}
