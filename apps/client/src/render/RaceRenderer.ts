// Race scene composition + per-frame update from interpolated sim state (lane L11 owns this file).
// Systems: environment rig, track view (culled chunks/props, prompt cubes), karts + mascots (L8 registries),
// driving VFX (sparks/smoke/skids/flames), item VFX (proxies, status rigs), ambient air, headlights,
// camera director (intro, grid, chase, finish), post chain per tier, BudgetTracker and dynamic resolution.
// High/Ultra also lazy-load the per-frame systems in render/systems (clipmap terrain, grass, forest, weather).
// Hot path rule: nothing below allocates per frame (scratch objects only).
import * as THREE from 'three/webgpu';
import { uniform, uniformArray } from 'three/tsl';
import type { ContentTables } from '@cr/content';
import { CVIS_MAGIC, CVIS_VERSION, readContainer, Phase, type BakedTrack, type WorldState, type SimEvent } from '@cr/sim';
import { getThemeKit } from './themes/registry.ts';
import type { ThemeKit } from './themes/kit.ts';
import { buildEnvironment, type Environment } from './env/environment.ts';
import { buildTrackView, type TrackView, type VisMeta } from './track/TrackView.ts';
import { TrackHazards } from './track/hazards.ts';
import { createPost, type Post } from './post/pipeline.ts';
import { withEverythingVisible, finishReveals } from './engine/warm.ts';
import { CameraDirector } from './camera/CameraDirector.ts';
import type { ChaseCamera } from './camera/ChaseCamera.ts';
import { buildMascot, type MascotInstance } from './mascot/rig.ts';
import { getCharacter } from './characters/registry.ts';
import { getKartBody } from './karts/registry.ts';
import type { KartModel } from './karts/types.ts';
import { MaterialLibrary } from './materials/library.ts';
import { tierSettings, prefersReducedMotion, withUserPrefs, FrameCap, getActiveBackend, noteAutoFrameTime, type QualityTier, type TierSettings } from './quality.ts';
import { LAYER_FX, tagFx } from './engine/layers.ts';
import { loadSystems } from './systems/registry.ts';
import type { FrameContext, FrameSystem, SharedFrameUniforms } from './systems/types.ts';
import type { PostFrameInput } from './post/stages.ts';
import { BudgetTracker } from './engine/budget.ts';
import { DrivingFx, type KartPose } from './vfx/driving.ts';
import { ItemFx } from './vfx/itemFx.ts';
import { AmbientFx } from './vfx/ambient.ts';
import { Headlights } from './vfx/headlights.ts';
import { setParticleClock, particleClock, setParticleFog } from './vfx/gpuParticles.ts';
import { airborneLift } from '@cr/sim/items/public.ts';
import { setListener, listenerDist } from '../audio/listener.ts';
import { Audio } from '../audio/engine.ts';
import { raceAudioPrepare } from '../audio/race.ts';
import { save, type SettingsV1 } from '../meta/save.ts';
import { devForce } from '../dev/force.ts';

export interface KartSlotVisual { slot: number; characterId: string; kartBodyId: string; livery: { primary: string; secondary: string; pattern: number; number: number } }

interface KartVis {
  slot: number; root: THREE.Group; kart: KartModel; mascot: MascotInstance;
  pose: KartPose; lod: number; hitT: number;
  /** Spin-out mesh spin: seconds left of SPIN_VIS_S, and its direction (±1). */
  spinT: number; spinDir: number;
}

/** A spin-out turns the kart mesh one full turn in this long (render only; the sim keeps its heading). */
const SPIN_VIS_S = 0.5;

/** Low tier: contiguous chunks merged per slot (≈ 300 m groups). trackc's V20 counts draws with the same value
 *  (packages/trackc/src/pvs.ts DEFAULT_PVS.merge); change both together. */
const LOW_MERGE_CHUNKS = 6;

export class RaceRenderer {
  readonly scene = new THREE.Scene();
  readonly director: CameraDirector;
  private env!: Environment;
  private view!: TrackView;
  private post!: Post;
  private kit: ThemeKit;
  private karts: KartVis[] = [];
  private bySlot: (KartVis | undefined)[] = [];
  private poses: KartPose[] = [];
  private driving!: DrivingFx;
  private items!: ItemFx;
  private ambient!: AmbientFx;
  private lights: Headlights | null = null;
  private budget!: BudgetTracker;
  private ts: TierSettings;
  private t = 0;
  private tmpM = new THREE.Matrix4(); private tmpX = new THREE.Vector3(); private tmpF = new THREE.Vector3(); private tmpP = new THREE.Vector3();
  private camFwd = new THREE.Vector3(); private camPrev = new THREE.Vector3(); private camVel = new THREE.Vector3();
  private lineAt = new THREE.Vector3();
  private fxAt = new THREE.Vector3();
  private ccM = new THREE.Matrix4();
  private curW: Readonly<WorldState> | null = null;
  /** Per-player box availability (no per-frame closure). */
  private boxAvail = (i: number): boolean => { const w = this.curW; return !!w && w.boxRespawn[i * 8 + this.localSlot]! <= w.tick; };
  private hazards: TrackHazards | null = null;
  private cap = new FrameCap();
  private dtBank = 0; private skipFrame = false;
  private unsub: (() => void) | null = null;
  private boostK = 0; private flashK = 0; private hitK = 0; private flickerT = 0;
  private resScale = 1; private dynT = 0; private goodT = 0;
  private reducedMotion: boolean;
  private countdownTicks: number;
  private systems: FrameSystem[] = [];
  private sysCtx: FrameContext | null = null;
  /** Shared per-frame uniforms for the systems (see systems/types.ts). */
  private readonly su: SharedFrameUniforms = {
    mainCamPos: uniform(new THREE.Vector3()), prevMainCamPos: uniform(new THREE.Vector3()),
    kartPos: uniformArray(Array.from({ length: 8 }, () => new THREE.Vector4(0, -1e5, 0, -1)), 'vec4'),
    dt: uniform(0), time: uniform(0), windDir: uniform(new THREE.Vector2(0.8, 0.6)), windStrength: uniform(1),
  };
  private readonly postIn: PostFrameInput = { dt: 0, camMode: 'chase', cutSerial: 0, focus: null, reducedMotion: false };
  private localTeleport = false;
  private lastFov = 0; private lastAspect = 0;
  private content: ContentTables;
  localSlot = 0;
  lookBack = false;

  private renderer: THREE.WebGPURenderer; private track: BakedTrack; private vis: ArrayBuffer; private tier: QualityTier;

  constructor(renderer: THREE.WebGPURenderer, track: BakedTrack, vis: ArrayBuffer, content: ContentTables, tier: QualityTier) {
    this.renderer = renderer; this.track = track; this.vis = vis; this.tier = tier; this.content = content;
    // per-track lighting (L12-track-env): the kit sees the track's THEME attrs (e.g. sky=sunset on one Spark track)
    const trackTheme = (readContainer(vis, CVIS_MAGIC, CVIS_VERSION).meta as VisMeta).theme ?? {};
    this.kit = getThemeKit(track.meta.themeId, content, trackTheme);
    const st = save.get().settings;
    this.ts = withUserPrefs(tierSettings(tier), st);
    this.director = new CameraDirector(renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight), track);
    this.reducedMotion = false;
    this.applySettings(st);
    // live Settings (pause menu): camera, shake, reduced motion and the frame cap apply at once
    this.unsub = save.subscribe((sv) => this.applySettings(sv.settings));
    this.countdownTicks = content.modes.countdownBeatTicks * 3;
  }

  /** Legacy accessor (Session / HUD code used `renderer.chase`). */
  get chase(): ChaseCamera { return this.director.chase; }

  async init(slots: KartSlotVisual[]): Promise<void> {
    const ts = this.ts;
    MaterialLibrary.configure(this.tier);
    finishReveals();
    // Settings → shadows may differ from the tier the Stage booted with
    this.renderer.shadowMap.enabled = ts.shadowSize > 0;
    const meta = readContainer(this.vis, CVIS_MAGIC, CVIS_VERSION).meta as VisMeta;
    this.env = await buildEnvironment(this.renderer, this.scene, this.kit, ts, meta.theme ?? {});
    const L = this.env.look;
    raceAudioPrepare({ trackId: this.track.id, themeId: this.kit.id, songId: this.kit.data.songId, ambient: L.ambient, sky: L.kind });
    const cam = this.director.camera;
    cam.far = ts.far;
    cam.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    fog.far = Math.min(fog.far, ts.far * 0.97); fog.near = Math.min(fog.near, fog.far * 0.6);
    setParticleFog(fog.color, fog.near, fog.far);
    // velocity-based post (TRAA, motion blur) needs every prop instance to keep its slot from frame to frame
    const stable = ts.aa === 'traa' || ts.velocityBlur !== null;
    this.view = buildTrackView(this.vis, this.track, this.kit, { mergeChunks: this.tier === 'low' ? LOW_MERGE_CHUNKS : this.tier === 'medium' ? 2 : 1, propFar: ts.propFar, foliage: ts.foliage, stableInstances: stable });
    this.scene.add(this.view.root);
    if (meta.hazards?.length && this.track.hazards.length) {
      this.hazards = new TrackHazards(meta.hazards, this.track, this.kit);
      // hazard sounds only near the listener (the mixer pans and attenuates; far cues would waste voices)
      this.hazards.onCue = (id, at) => { if (listenerDist(at) < 90) Audio.sfx(id, { pos: at }); };
      this.scene.add(this.hazards.root);
    }
    const line = this.view.meta.line;
    if (line) this.lineAt.set(line.x, line.y, line.z);
    this.driving = new DrivingFx(slots.length, ts.particles);
    for (const s of slots) {
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      const kart = getKartBody(s.kartBodyId).build(s.livery);
      root.add(kart.root);
      const mascot = buildMascot(getCharacter(s.characterId));
      mascot.root.scale.setScalar(0.62);
      mascot.onFx = (name, at) => { at.getWorldPosition(this.fxAt); this.driving.emoteFx(name, this.fxAt); };
      kart.seat.add(mascot.root);
      this.scene.add(root);
      const pose: KartPose = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), left: new THREE.Vector3(1, 0, 0), speed: 0, lat: 0, visible: false };
      const kv: KartVis = { slot: s.slot, root, kart, mascot, pose, lod: 0, hitT: 0, spinT: 0, spinDir: 1 };
      this.karts.push(kv);
      this.bySlot[s.slot] = kv;
      this.poses[s.slot] = pose;
      this.driving.setExhausts(this.karts.length - 1, kart.exhausts);
    }
    for (let i = 0; i < 8; i++) if (!this.poses[i]) this.poses[i] = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), left: new THREE.Vector3(1, 0, 0), speed: 0, lat: 0, visible: false };
    for (const o of this.driving.objects()) this.scene.add(o);
    // dev only (?force=drag,reverse): technique presentation on the local kart for screenshot review
    if (devForce.drag || devForce.reverse) this.driving.force = { slot: this.localSlot, drag: devForce.drag, reverse: devForce.reverse };
    const roots: THREE.Object3D[] = [];
    for (let i = 0; i < 8; i++) roots.push(this.bySlot[i]?.root ?? new THREE.Object3D());
    this.items = new ItemFx(this.driving.sparks, this.driving.smoke, roots, this.content, this.localSlot, {
      shake: (a) => this.director.chase.shake(a), flash: (k) => { this.flashK = Math.max(this.flashK, k); }, flicker: (s) => { this.flickerT = Math.max(this.flickerT, s); },
      hit: (k) => { this.hitK = Math.max(this.hitK, k); },
    });
    this.scene.add(this.items.root);
    this.ambient = new AmbientFx(L.ambient, this.driving.sparks, this.driving.smoke);
    if (L.headlights) {
      this.lights = new Headlights(this.karts.length, this.tier === 'high' || this.tier === 'ultra');
      this.scene.add(this.lights.mesh);
      const me = this.bySlot[this.localSlot];
      if (me && this.lights.spot) me.root.add(this.lights.spot, this.lights.spot.target);
    }
    // effects stay out of the screen-space buffers (the Ultra prepass renders layer 0 only); the race camera sees both
    for (const o of this.driving.objects()) tagFx(o);
    tagFx(this.items.root);
    if (this.lights) tagFx(this.lights.mesh);
    cam.layers.enable(LAYER_FX);
    this.su.windStrength.value = L.wind;
    if (ts.systems) {
      // lazy: the field builder and every system live in their own chunks (Low/Medium never load them)
      const ground = await (await import('./ground/index.ts')).loadGroundField(this.vis);
      this.sysCtx = {
        renderer: this.renderer, scene: this.scene, camera: cam, tier: this.tier, ts, backend: getActiveBackend(), kit: this.kit, look: L, env: this.env,
        track: this.track, vis: this.vis, meta, view: this.view, ground, poses: this.poses, localSlot: this.localSlot, u: this.su,
      };
      this.systems = await loadSystems(this.sysCtx);
    }
    this.post = createPost(this.renderer, this.scene, cam, { ts, reducedMotion: this.reducedMotion, grade: { ...L.grade, bloom: L.bloom ?? ts.bloomStrength }, env: this.env, backend: getActiveBackend() });
    this.budget = new BudgetTracker(this.renderer, this.tier, ts, () => MaterialLibrary.count());
    this.items.prewarm();
    await this.warmShaders();
    this.budget.countMaterials(this.scene);
  }

  /**
   * Compiles every program the race can need behind the loading screen: pooled/hidden objects and off-screen
   * chunks are made visible and unculled for the pass, then one real frame links the post chain and shadow
   * programs. Without this, SwiftShader stalls for seconds whenever a new item or chunk first appears.
   */
  private async warmShaders(): Promise<void> {
    await withEverythingVisible(this.scene, async () => {
      await this.post.warm();
      this.post.render();
    });
    this.renderer.info.reset();
  }

  /**
   * Render-only motion of hard crowd control (the sim moves the body but never tumbles it): `airborne` lifts the
   * kart along airborneLift (4 m peak) with one barrel roll, `spin` turns it twice in 60 ticks easing out, and the
   * `trap` bubbles float it 1 m with a slow bob. `m` is the kart's basis matrix, modified in place.
   */
  private ccPose(k: Readonly<WorldState['karts'][number]>, t: number, m: THREE.Matrix4, up: THREE.Vector3): void {
    const st = k.status;
    if (!st.cc || t >= st.ccEnd) return;
    const kin = this.content.effects.byCode[st.cc]?.mods.kinematic;
    if (kin !== 'airborne' && kin !== 'spin' && kin !== 'trap') return;
    const ck = t - st.ccStart, dur = Math.max(1, st.ccEnd - st.ccStart);
    let lift = 0;
    if (kin === 'airborne') {
      lift = airborneLift(ck, dur);
      const x = Math.min(1, Math.max(0, ck / (dur * 0.8)));
      this.ccM.makeRotationZ(Math.PI * 2 * x * x * (3 - 2 * x));
      m.multiply(this.ccM);
    } else if (kin === 'spin') {
      const x = Math.min(1, Math.max(0, ck / 60));
      this.ccM.makeRotationY(Math.PI * 4 * (1 - (1 - x) * (1 - x)));
      m.multiply(this.ccM);
    } else {
      const inK = Math.min(1, ck / 8), outK = Math.min(1, Math.max(0, (dur - ck) / 8));
      lift = (inK * inK * (3 - 2 * inK)) * (outK * outK * (3 - 2 * outK)) * (1 + Math.sin(this.t * 2.6) * 0.12);
    }
    if (lift > 0) { const e = m.elements; e[12]! += up.x * lift; e[13]! += up.y * lift; e[14]! += up.z * lift; }
  }

  private applySettings(st: Readonly<SettingsV1>): void {
    this.reducedMotion = prefersReducedMotion(st.reducedMotion);
    const ch = this.director.chase;
    ch.reducedMotion = this.reducedMotion;
    ch.shakeEnabled = st.cameraShake;
    ch.distanceScale = st.cameraDistance === 'near' ? 0.82 : st.cameraDistance === 'far' ? 1.22 : 1;
    this.cap.cap = st.fpsCap ?? 60;
  }

  /** Per-frame update. `alpha` interpolates prev→curr sim states. */
  update(prev: Readonly<WorldState>, curr: Readonly<WorldState>, alpha: number, dtIn: number): void {
    const now = performance.now();
    // Settings → frame cap: skipped frames bank their time for the next drawn one (springs and particles stay in step)
    this.dtBank += dtIn;
    this.skipFrame = !this.cap.ready(now);
    if (this.skipFrame) return;
    const dt = Math.min(0.25, this.dtBank);
    this.dtBank = 0;
    this.budget.beginFrame(now);
    const fxDt = dt * this.director.timeScale;
    this.t += fxDt;
    setParticleClock(particleClock() + fxDt);
    this.driving.begin(fxDt);
    if (this.lights) this.lights.begin();
    const cam = this.director.camera;
    const camPos = cam.position;
    const lod1 = this.ts.lod[0] * this.ts.lod[0], lod2 = this.ts.lod[1] * this.ts.lod[1];
    for (let ki = 0; ki < this.karts.length; ki++) {
      const kv = this.karts[ki]!;
      const a = prev.karts[kv.slot]!, b = curr.karts[kv.slot]!;
      const p = kv.pose;
      if (!b.active) { kv.root.visible = false; p.visible = false; continue; }
      const A = a.body, B = b.body;
      const teleport = Math.abs(A.px - B.px) + Math.abs(A.pz - B.pz) > 8;
      if (teleport && kv.slot === this.localSlot) this.localTeleport = true;
      const k = teleport ? 1 : alpha;
      p.pos.set(A.px + (B.px - A.px) * k, A.py + (B.py - A.py) * k, A.pz + (B.pz - A.pz) * k);
      p.fwd.set(A.fx + (B.fx - A.fx) * k, A.fy + (B.fy - A.fy) * k, A.fz + (B.fz - A.fz) * k).normalize();
      p.up.set(A.nx + (B.nx - A.nx) * k, A.ny + (B.ny - A.ny) * k, A.nz + (B.nz - A.nz) * k).normalize();
      const left = this.tmpX.crossVectors(p.up, p.fwd).normalize();
      const fwd = this.tmpF.crossVectors(left, p.up).normalize();
      p.left.copy(left);
      this.tmpM.makeBasis(left, p.up, fwd).setPosition(p.pos);
      this.ccPose(b, curr.tick + alpha, this.tmpM, p.up);
      if (kv.spinT > 0) {
        // spin-out: one full turn about the kart's up axis, fast then settling (ease-out cubic)
        kv.spinT = Math.max(0, kv.spinT - fxDt);
        const x = 1 - kv.spinT / SPIN_VIS_S, e = 1 - (1 - x) * (1 - x) * (1 - x);
        this.ccM.makeRotationY(kv.spinDir * Math.PI * 2 * e);
        this.tmpM.multiply(this.ccM);
      }
      kv.root.matrix.copy(this.tmpM);
      kv.root.matrixWorldNeedsUpdate = true;
      const vx = B.vx, vy = B.vy, vz = B.vz;
      p.speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const u = vx * fwd.x + vy * fwd.y + vz * fwd.z;
      p.lat = vx * left.x + vy * left.y + vz * left.z;
      const steerVis = Math.max(-1, Math.min(1, -B.yawRate / 1.6));
      const d = b.drive;
      const boosting = d.boostTicks > 0 || d.startTicks > 0 || d.instTicks > 0;
      kv.kart.update({ steer: steerVis, wheelSpin: u / 0.22, boost: d.boostKind, drift: d.drift === 1, speed: p.speed }, fxDt);
      const hit: 0 | 1 | 2 = d.stunTicks > 0 || b.status.cc ? 1 : 0;
      kv.mascot.setPose({ steer: steerVis, lean: p.speed > 1 ? p.lat / Math.max(8, p.speed) : 0, speed01: Math.min(1, p.speed / 40), drifting: d.drift === 1, boosting, airborne: B.grounded === 0, hit }, fxDt);
      // respawn ghost: blink while ghosted after a respawn
      const ghost = B.ghostTicks > 0 && b.race.respawnPhase !== 0;
      kv.root.visible = !(ghost && Math.floor(this.t * 12) % 2 === 0);
      p.visible = kv.root.visible || ghost;
      // LODs (if the kart / mascot builders provide them)
      const dx = p.pos.x - camPos.x, dy = p.pos.y - camPos.y, dz = p.pos.z - camPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const lod = d2 > lod2 ? 2 : d2 > lod1 ? 1 : 0;
      if (lod !== kv.lod) {
        kv.lod = lod;
        (kv.kart as unknown as { setLod?: (l: number) => void }).setLod?.(lod);
        (kv.mascot as unknown as { setLod?: (l: number) => void }).setLod?.(lod);
      }
      const near = d2 < 90 * 90;
      this.driving.kart(ki, p, b, fxDt, near);
      if (this.lights) this.lights.kart(p);
    }
    this.driving.end();
    this.items.update(prev, curr, alpha, this.poses, fxDt, this.t);
    this.hazards?.update(curr.tick, alpha, fxDt, this.driving.sparks, this.driving.smoke);
    if (this.lights) this.lights.end();
    const me = this.bySlot[this.localSlot] ?? this.karts[0];
    if (me) {
      const k = curr.karts[me.slot]!;
      const d = k.drive;
      const boosting = d.boostTicks > 0 || d.startTicks > 0;
      const u = me.pose.fwd.x * k.body.vx + me.pose.fwd.y * k.body.vy + me.pose.fwd.z * k.body.vz;
      const slip = -Math.atan2(me.pose.lat, Math.max(1, Math.abs(u)));
      this.director.update({
        phase: curr.phase, tick: curr.tick, goTick: curr.goTick, countdownTicks: this.countdownTicks, finished: k.race.finishTick >= 0, dt,
        target: { pos: me.pose.pos, fwd: me.pose.fwd, up: me.pose.up, speed: me.pose.speed, boosting, drift: d.drift ? d.driftDir : 0, lookBack: this.lookBack, airborne: k.body.grounded === 0, slip },
      });
      if (this.localTeleport) { this.director.bumpCut(); this.localTeleport = false; }
      // cascades re-split when the projection changes (boost FOV kick, resize)
      if (cam.fov !== this.lastFov || cam.aspect !== this.lastAspect) { this.lastFov = cam.fov; this.lastAspect = cam.aspect; this.env.onCameraChange(cam); }
      cam.getWorldDirection(this.camFwd);
      this.env.follow(me.pose.pos, this.camFwd);
      // post juice: boost ramps over ~0.15 s; blur / CA / FOV are off with reduced motion
      this.boostK += ((boosting ? 1 : 0) - this.boostK) * Math.min(1, dt / 0.15);
      const U = this.post.u;
      U.boost.value = this.boostK;
      U.blur.value = this.reducedMotion || this.director.mode !== 'chase' ? 0 : this.boostK * (d.boostKind === 2 ? 1.2 : 1);
      U.chroma.value = this.reducedMotion ? 0 : this.boostK * this.ts.chroma * 2;
      U.lines.value = this.reducedMotion ? 0 : Math.max(this.boostK, Math.min(1, Math.max(0, (me.pose.speed - 30) / 12)) * 0.5);
      U.speed.value = Math.min(1, me.pose.speed / 44);
      this.flashK = Math.max(0, this.flashK - dt * 3.5);
      this.hitK = Math.max(0, this.hitK - dt * 2.2);
      U.flash.value = this.reducedMotion ? this.flashK * 0.4 : this.flashK;
      U.hit.value = this.hitK;
      if (this.flickerT > 0) { this.flickerT -= dt; U.fade.value = Math.sin(this.t * 55) > 0.2 ? 0.35 : 0.05; } else U.fade.value = 0;
    }
    // personal item boxes for the local player; props culled against this frame's camera (after the director moved it)
    this.curW = curr;
    this.view.update(this.t, this.boxAvail, cam);
    this.ambient.update(cam.position, this.camFwd, fxDt);
    this.updateSystems(fxDt, me?.pose.pos ?? null);
    // spatial audio listener = camera (velocity for Doppler)
    this.camVel.copy(cam.position).sub(this.camPrev).divideScalar(Math.max(1e-3, dt));
    this.camPrev.copy(cam.position);
    setListener(cam.position, this.camFwd, cam.up, this.camVel);
    this.driving.sparks.flush(); this.driving.smoke.flush();
    this.budget.markUpdated(performance.now());
  }

  /** Shared uniforms, then every system, then the post chain's per-frame inputs. No allocation. */
  private updateSystems(dt: number, focus: THREE.Vector3 | null): void {
    const cam = this.director.camera;
    const U = this.su;
    (U.prevMainCamPos.value as THREE.Vector3).copy(U.mainCamPos.value as THREE.Vector3);
    (U.mainCamPos.value as THREE.Vector3).copy(cam.position);
    U.dt.value = dt; U.time.value = this.t;
    const kp = U.kartPos.array as THREE.Vector4[];
    for (let i = 0; i < 8; i++) {
      const p = this.poses[i]!;
      kp[i]!.set(p.pos.x, p.pos.y, p.pos.z, p.visible ? p.speed : -1);
    }
    const c = this.sysCtx;
    if (c) for (let i = 0; i < this.systems.length; i++) this.systems[i]!.update(c, dt, this.t);
    const pi = this.postIn;
    pi.dt = dt; pi.camMode = this.director.mode; pi.cutSerial = this.director.cutSerial; pi.focus = focus; pi.reducedMotion = this.reducedMotion;
    this.post.frame(pi);
  }

  private readonly poseOf = (s: number): KartPose | null => { const p = this.poses[s]; return p && p.visible ? p : null; };

  onEvent(e: SimEvent): void {
    const me = this.localSlot;
    const pose = this.poseOf;
    this.driving.event(e, pose, me);
    this.items.event(e, pose);
    const ch = this.director.chase;
    switch (e.t) {
      case 'wall': if (e.kart === me) { if (e.speed > 18 || e.severity === 2) ch.shake(0.18); else if (e.speed > 9 || e.severity === 1) ch.shake(0.08); } break;
      case 'land': if (e.kart === me && e.impact > 6) ch.shake(0.05); break;
      case 'bump': if ((e.a === me || e.b === me) && e.impulse > 4) ch.shake(0.05); break;
      case 'instantBoost': if (e.kart === me) this.flashK = Math.max(this.flashK, 0.7); break;
      case 'startBoost': if (e.kart === me && (e.tier === 'perfect' || e.tier === 'great')) this.flashK = Math.max(this.flashK, e.tier === 'perfect' ? 1 : 0.6); break;
      case 'boostStart': if (e.kart === me && e.kind === 2) this.flashK = Math.max(this.flashK, 0.5); break;
      case 'countdown': if (e.n === 0) this.driving.goRing(this.lineAt); break;
      case 'box': if (e.kart === me) this.driving.boxShatter(this.view.boxPos(e.boxId, this.tmpP)); break;
      case 'finish': {
        const kv = this.bySlot[e.kart];
        kv?.mascot.playEmote(e.rank <= 3 ? 'win' : 'lose');
        if (e.kart === me) { this.director.onLocalFinish(); this.driving.confetti(this.lineAt, e.rank === 1, this.view.meta.line?.w ?? 14); }
        break;
      }
      case 'effect': {
        if (e.result !== 'hit') break;
        this.bySlot[e.victim]?.mascot.playEmote('gotHit');
        if (e.source >= 0 && e.source !== e.victim) this.bySlot[e.source]?.mascot.playEmote('attackLanded');
        break;
      }
      case 'retire': this.bySlot[e.kart]?.mascot.playEmote('retire'); break;
      case 'spinOut': {
        const kv = this.bySlot[e.kart];
        if (kv) {
          // spin toward the slide (the lateral velocity at the spin), and the mascot's dizzy hit pose
          kv.spinT = SPIN_VIS_S; kv.spinDir = kv.pose.lat >= 0 ? 1 : -1;
          kv.mascot.playEmote('gotHit');
        }
        if (e.kart === me) ch.shake(0.1);
        break;
      }
      case 'tapBoost': if (e.kart === me) this.flashK = Math.max(this.flashK, 0.12 + 0.08 * Math.min(3, e.streak)); break;
      default: break;
    }
  }

  /** World → screen (for DOM name tags). No allocation. */
  project(slot: number, out: { x: number; y: number; visible: boolean; dist: number }): void {
    const kv = this.bySlot[slot];
    if (!kv || !kv.pose.visible) { out.visible = false; return; }
    const p = this.tmpP.copy(kv.pose.pos).addScaledVector(kv.pose.up, 1.6);
    const cam = this.director.camera;
    out.dist = p.distanceTo(cam.position);
    p.project(cam);
    out.visible = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
    out.x = (p.x * 0.5 + 0.5); out.y = (-p.y * 0.5 + 0.5);
  }

  minimap(): Float32Array { return this.view.minimap; }

  // ---- Time Attack ghost (orchestrator, L10-session-hooks §3): a translucent, shadowless kart posed from a replay world
  private ghost: { root: THREE.Group; kart: KartModel; mascot: MascotInstance; mat: THREE.Material } | null = null;
  private readonly gM = new THREE.Matrix4();
  private readonly gP = new THREE.Vector3();
  private readonly gF = new THREE.Vector3();
  private readonly gU = new THREE.Vector3();
  private readonly gL = new THREE.Vector3();

  /** Shows (or with null removes) the ghost kart. No FX, name tag, shadow or collision. */
  setGhost(v: { characterId: string; kartBodyId: string } | null): void {
    if (this.ghost) { this.scene.remove(this.ghost.root); this.ghost.kart.dispose(); this.ghost.mascot.dispose(); this.ghost = null; } // the hologram material is shared (library)
    if (!v) return;
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.visible = false;
    const kart = getKartBody(v.kartBodyId).build({ primary: '#9fd3f5', secondary: '#faf9f5', pattern: 0, number: 0 });
    const mascot = buildMascot(getCharacter(v.characterId));
    mascot.root.scale.setScalar(0.62);
    kart.seat.add(mascot.root);
    root.add(kart.root);
    const mat = MaterialLibrary.ghost();
    // transparent overlays (decals, glass, the contact shadow) would turn into hologram planes: the ghost keeps the solid parts only
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { if ((m.material as THREE.Material).transparent) m.visible = false; m.material = mat; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; } });
    tagFx(root);
    this.scene.add(root);
    this.ghost = { root, kart, mascot, mat };
  }

  /** Poses the ghost from slot `slot` of the replay world, interpolated like the race karts. */
  updateGhost(prev: Readonly<WorldState>, curr: Readonly<WorldState>, alpha: number, dt: number, slot = 0): void {
    const g = this.ghost;
    if (!g) return;
    const a = prev.karts[slot], b = curr.karts[slot];
    if (!a || !b || !b.active) { g.root.visible = false; return; }
    const A = a.body, B = b.body;
    const k = Math.abs(A.px - B.px) + Math.abs(A.pz - B.pz) > 8 ? 1 : alpha;
    this.gP.set(A.px + (B.px - A.px) * k, A.py + (B.py - A.py) * k, A.pz + (B.pz - A.pz) * k);
    this.gF.set(A.fx + (B.fx - A.fx) * k, A.fy + (B.fy - A.fy) * k, A.fz + (B.fz - A.fz) * k).normalize();
    this.gU.set(A.nx + (B.nx - A.nx) * k, A.ny + (B.ny - A.ny) * k, A.nz + (B.nz - A.nz) * k).normalize();
    this.gL.crossVectors(this.gU, this.gF).normalize();
    this.gF.crossVectors(this.gL, this.gU).normalize();
    this.gM.makeBasis(this.gL, this.gU, this.gF).setPosition(this.gP);
    g.root.matrix.copy(this.gM);
    g.root.matrixWorldNeedsUpdate = true;
    // fade out when the ghost sits on top of the player's kart so it never hides the car you drive
    const me = this.poses[this.localSlot];
    const near = me ? me.pos.distanceToSquared(this.gP) : 1e9;
    g.root.visible = near > 2.5 * 2.5;
    const speed = Math.sqrt(B.vx * B.vx + B.vy * B.vy + B.vz * B.vz);
    const u = B.vx * this.gF.x + B.vy * this.gF.y + B.vz * this.gF.z;
    g.kart.update({ steer: Math.max(-1, Math.min(1, -B.yawRate / 1.6)), wheelSpin: u / 0.22, boost: b.drive.boostKind, drift: b.drive.drift === 1, speed }, dt);
  }

  render(): void {
    if (this.skipFrame) return;
    this.post.render();
    const now = performance.now();
    this.budget.endFrame(now, this.scene);
    this.dynamicResolution();
  }

  /** Low tier: p90 > 16.7 ms over 2 s → scale −0.1 (floor 0.7); p90 < 12 ms for 5 s → +0.1. */
  private dynamicResolution(): void {
    if (this.ts.dynResMin >= 1) return;
    const n = this.budget.frameSamples();
    if (n < 30) return;
    this.dynT++;
    if (this.dynT % 30 !== 0) return;
    const p90 = this.budget.frameP90();
    if (p90 > 16.7 && this.resScale > this.ts.dynResMin + 1e-3) {
      this.resScale = Math.max(this.ts.dynResMin, this.resScale - 0.1); this.goodT = 0;
      this.post.setResolutionScale(this.resScale); this.budget.resScale = this.resScale; this.budget.resetFrameWindow();
    } else if (p90 < 12) {
      this.goodT += 30;
      if (this.goodT > 300 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.1); this.goodT = 0; this.post.setResolutionScale(this.resScale); this.budget.resScale = this.resScale; }
    } else this.goodT = 0;
  }

  resize(w: number, h: number): void { this.director.chase.resize(w / Math.max(1, h)); }
  stats(): { meshes: number; tris: number; materials: number } { return { ...this.view.stats, materials: this.budget?.snap.uniqueMaterials ?? MaterialLibrary.count() }; }

  dispose(): void {
    this.unsub?.(); this.unsub = null;
    this.hazards?.dispose();
    this.setGhost(null);
    // a slow first race on auto-selected Ultra remembers High for this browser (quality.ts)
    if (this.budget) noteAutoFrameTime(this.tier, this.budget.snap.frameMs.p95);
    for (const sys of this.systems) sys.dispose();
    this.systems = []; this.sysCtx = null;
    this.post.dispose();
    this.env.dispose();
    this.view.dispose();
    this.driving.dispose();
    this.items.dispose();
    this.lights?.dispose();
    for (const k of this.karts) { k.kart.dispose(); k.mascot.dispose(); }
    this.scene.clear();
  }
}

export { Phase };
