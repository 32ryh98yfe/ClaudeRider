// Race scene composition + per-frame update from interpolated sim state.
import * as THREE from 'three/webgpu';
import type { ContentTables } from '@cr/content';
import type { BakedTrack, WorldState, SimEvent } from '@cr/sim';
import { Boost } from '@cr/sim';
import { getThemeKit } from './themes/registry.ts';
import type { ThemeKit } from './themes/kit.ts';
import { buildEnvironment, type Environment } from './env/environment.ts';
import { buildTrackView, type TrackView } from './track/TrackView.ts';
import { createPost, type Post } from './post/pipeline.ts';
import { ChaseCamera } from './camera/ChaseCamera.ts';
import { ParticlePool } from './vfx/particles.ts';
import { buildMascot, type MascotInstance } from './mascot/rig.ts';
import { getCharacter } from './characters/registry.ts';
import { getKartBody } from './karts/registry.ts';
import type { KartModel } from './karts/types.ts';
import { MaterialLibrary } from './materials/library.ts';
import type { QualityTier } from './quality.ts';
import { tierSettings } from './quality.ts';

export interface KartSlotVisual { slot: number; characterId: string; kartBodyId: string; livery: { primary: string; secondary: string; pattern: number; number: number } }

interface KartVis {
  slot: number; root: THREE.Group; kart: KartModel; mascot: MascotInstance; flames: THREE.Mesh[]; flameK: number; lastDrift: number;
  pos: THREE.Vector3; fwd: THREE.Vector3; up: THREE.Vector3; speed: number; ghost: number;
}

const SPARK_TIERS = [new THREE.Color('#fff6e0'), new THREE.Color('#ff9a6a'), new THREE.Color('#b57cff')];
const SMOKE = new THREE.Color('#d9d4cc');

export class RaceRenderer {
  readonly scene = new THREE.Scene();
  readonly chase: ChaseCamera;
  private env!: Environment;
  private view!: TrackView;
  private post!: Post;
  private kit: ThemeKit;
  private karts: KartVis[] = [];
  private sparks = new ParticlePool(700, { additive: true });
  private smoke = new ParticlePool(260, { additive: false, soft: true });
  private t = 0;
  private tmpM = new THREE.Matrix4();
  private tmpX = new THREE.Vector3();
  localSlot = 0;
  lookBack = false;

  private renderer: THREE.WebGPURenderer; private track: BakedTrack; private vis: ArrayBuffer; private tier: QualityTier;

  constructor(renderer: THREE.WebGPURenderer, track: BakedTrack, vis: ArrayBuffer, content: ContentTables, tier: QualityTier) {
    this.renderer = renderer; this.track = track; this.vis = vis; this.tier = tier;
    this.kit = getThemeKit(track.meta.themeId, content);
    this.chase = new ChaseCamera(renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight));
    this.sparks.gravity = -9; this.sparks.drag = 1.5;
    this.smoke.gravity = 1.2; this.smoke.drag = 2.8;
  }

  async init(slots: KartSlotVisual[]): Promise<void> {
    const ts = tierSettings(this.tier);
    this.env = await buildEnvironment(this.renderer, this.scene, this.kit, ts.shadowSize);
    this.view = buildTrackView(this.vis, this.track, this.kit);
    this.scene.add(this.view.root);
    for (const s of slots) {
      const root = new THREE.Group();
      const kart = getKartBody(s.kartBodyId).build(s.livery);
      root.add(kart.root);
      const mascot = buildMascot(getCharacter(s.characterId));
      mascot.root.scale.setScalar(0.6);
      kart.seat.add(mascot.root);
      const flames: THREE.Mesh[] = [];
      const fg = new THREE.ConeGeometry(0.13, 1.1, 10, 1, true);
      fg.translate(0, -0.55, 0); fg.rotateX(-Math.PI / 2);
      for (const ex of kart.exhausts) { const f = new THREE.Mesh(fg, MaterialLibrary.flame('#fff3c4', '#ff6a2b')); f.scale.setScalar(0.001); ex.add(f); flames.push(f); }
      this.scene.add(root);
      this.karts.push({ slot: s.slot, root, kart, mascot, flames, flameK: 0, lastDrift: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), speed: 0, ghost: 0 });
    }
    this.scene.add(this.sparks.mesh, this.smoke.mesh);
    this.post = createPost(this.renderer, this.scene, this.chase.camera, { bloom: ts.bloom, fxaa: ts.fxaa });
    // warm up shader compilation behind the loading screen
    await this.renderer.compileAsync(this.scene, this.chase.camera);
  }

  /** Per-frame update. `alpha` interpolates prev→curr sim states. */
  update(prev: Readonly<WorldState>, curr: Readonly<WorldState>, alpha: number, dt: number): void {
    this.t += dt;
    for (const kv of this.karts) {
      const a = prev.karts[kv.slot]!, b = curr.karts[kv.slot]!;
      if (!b.active) { kv.root.visible = false; continue; }
      const A = a.body, B = b.body;
      const teleport = Math.abs(A.px - B.px) + Math.abs(A.pz - B.pz) > 8;
      const k = teleport ? 1 : alpha;
      kv.pos.set(A.px + (B.px - A.px) * k, A.py + (B.py - A.py) * k, A.pz + (B.pz - A.pz) * k);
      kv.fwd.set(A.fx + (B.fx - A.fx) * k, A.fy + (B.fy - A.fy) * k, A.fz + (B.fz - A.fz) * k).normalize();
      kv.up.set(A.nx + (B.nx - A.nx) * k, A.ny + (B.ny - A.ny) * k, A.nz + (B.nz - A.nz) * k).normalize();
      const left = this.tmpX.crossVectors(kv.up, kv.fwd).normalize();
      const fwd = new THREE.Vector3().crossVectors(left, kv.up).normalize();
      this.tmpM.makeBasis(left, kv.up, fwd).setPosition(kv.pos);
      kv.root.matrixAutoUpdate = false;
      kv.root.matrix.copy(this.tmpM);
      kv.root.matrixWorldNeedsUpdate = true;
      const vx = B.vx, vy = B.vy, vz = B.vz;
      kv.speed = Math.hypot(vx, vy, vz);
      const u = vx * fwd.x + vy * fwd.y + vz * fwd.z;
      const lat = vx * left.x + vy * left.y + vz * left.z;
      const steerVis = Math.max(-1, Math.min(1, -B.yawRate / 1.6));
      const d = b.drive;
      const boosting = d.boostTicks > 0 || d.startTicks > 0 || d.instTicks > 0;
      kv.kart.update({ steer: steerVis, wheelSpin: u / 0.22, boost: d.boostKind, drift: d.drift === 1, speed: kv.speed }, dt);
      kv.mascot.setPose({ steer: steerVis, lean: kv.speed > 1 ? lat / Math.max(8, kv.speed) : 0, speed01: Math.min(1, kv.speed / 40), drifting: d.drift === 1, boosting, airborne: B.grounded === 0, hit: d.stunTicks > 0 ? 1 : 0 }, dt);
      // boost flames
      const targetFlame = d.boostTicks > 0 ? (d.boostKind === Boost.TEAM ? 1.35 : 1.15) : d.startTicks > 0 || d.instTicks > 0 ? 0.8 : kv.speed > 5 ? 0.12 : 0;
      kv.flameK += (targetFlame - kv.flameK) * Math.min(1, dt * 12);
      for (const f of kv.flames) { const s = Math.max(0.001, kv.flameK); f.scale.set(s * (0.9 + Math.random() * 0.2), s * (0.9 + Math.random() * 0.2), s * (0.8 + Math.random() * 0.5)); }
      // ghost blink (respawn)
      kv.root.visible = !(B.ghostTicks > 0 && Math.floor(this.t * 12) % 2 === 0);
      // drift sparks + smoke from the rear wheels
      if (d.drift === 1 && B.grounded && kv.speed > 8) {
        const tier = d.driftTicks < 30 ? 0 : d.driftTicks < 75 ? 1 : 2;
        const c = SPARK_TIERS[tier]!;
        for (const side of [-0.6, 0.6]) {
          const wx = kv.pos.x + left.x * side - fwd.x * 0.55, wy = kv.pos.y + 0.08, wz = kv.pos.z + left.z * side - fwd.z * 0.55;
          if (Math.random() < 0.9) this.sparks.spawn(wx, wy, wz, -fwd.x * 4 + (Math.random() - 0.5) * 3 - lat * 0.1, 1.5 + Math.random() * 2.5, -fwd.z * 4 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 0.09 + tier * 0.03, c);
          if (Math.random() < 0.35) this.smoke.spawn(wx, wy + 0.1, wz, -fwd.x * 2 + (Math.random() - 0.5), 0.6, -fwd.z * 2 + (Math.random() - 0.5), 0.9 + Math.random() * 0.6, 0.7 + Math.random() * 0.6, SMOKE);
        }
      }
    }
    // box availability for the local player (personal boxes)
    this.view.update(this.t, (i) => curr.boxRespawn[i * 8 + this.localSlot]! <= curr.tick);
    this.sparks.update(dt, this.chase.camera);
    this.smoke.update(dt, this.chase.camera);
    const me = this.karts.find((k) => k.slot === this.localSlot) ?? this.karts[0];
    if (me) {
      const d = curr.karts[me.slot]!.drive;
      const boosting = d.boostTicks > 0 || d.startTicks > 0;
      this.chase.update({ pos: me.pos, fwd: me.fwd, up: me.up, speed: me.speed, boosting, drift: d.drift ? d.driftDir : 0, lookBack: this.lookBack, airborne: curr.karts[me.slot]!.body.grounded === 0 }, dt);
      this.env.follow(me.pos);
      this.post.boost.value += ((boosting ? 1 : 0) - this.post.boost.value) * Math.min(1, dt * 6);
    }
  }

  onEvent(e: SimEvent): void {
    if (e.t === 'wall' && e.kart === this.localSlot && e.severity > 0) this.chase.shake(e.severity === 2 ? 0.35 : 0.15);
    if (e.t === 'land' && e.kart === this.localSlot && e.impact > 8) this.chase.shake(0.12);
    if (e.t === 'finish' || e.t === 'raceEnd') { const kv = this.karts.find((k) => k.slot === ('kart' in e ? e.kart : -1)); kv?.mascot.playEmote(e.t === 'finish' && e.rank <= 3 ? 'win' : 'lose'); }
  }

  /** World → screen (for DOM name tags). */
  project(slot: number, out: { x: number; y: number; visible: boolean; dist: number }): void {
    const kv = this.karts.find((k) => k.slot === slot);
    if (!kv) { out.visible = false; return; }
    const p = kv.pos.clone().addScaledVector(kv.up, 1.6);
    const cam = this.chase.camera;
    out.dist = p.distanceTo(cam.position);
    p.project(cam);
    out.visible = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
    out.x = (p.x * 0.5 + 0.5); out.y = (-p.y * 0.5 + 0.5);
  }

  minimap(): Float32Array { return this.view.minimap; }
  render(): void { this.post.render(); }
  resize(w: number, h: number): void { this.chase.resize(w / Math.max(1, h)); }
  stats(): { meshes: number; tris: number; materials: number } { return { ...this.view.stats, materials: MaterialLibrary.count() }; }

  dispose(): void {
    this.post.dispose();
    this.env.dispose();
    this.view.dispose();
    for (const k of this.karts) { k.kart.dispose(); k.mascot.dispose(); }
    this.scene.clear();
  }
}
