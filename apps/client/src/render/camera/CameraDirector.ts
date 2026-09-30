// Camera director (30-art-bible §12): PRE-phase intro fly-by along the track spline, grid orbit around the
// local kart, chase during the race, finish orbit (radius 6 m, height 2 m, 360° in 6 s) after a FINISH slam
// with 0.35 s of 0.4× render slow motion. Cuts between rigs blend position and look-at over ~0.6 s.
import * as THREE from 'three/webgpu';
import type { BakedTrack, FrameSample } from '@cr/sim';
import { ChaseCamera, type CamTarget } from './ChaseCamera.ts';

export type CamMode = 'intro' | 'grid' | 'chase' | 'finish';

export interface DirectorInput {
  phase: number; tick: number; goTick: number;
  /** Ticks of the countdown phase (3 beats). */
  countdownTicks: number;
  target: CamTarget;
  finished: boolean;
  dt: number;
}

const GRID_TICKS = 90;

export class CameraDirector {
  readonly chase: ChaseCamera;
  mode: CamMode = 'chase';
  /** Render time scale for VFX/camera (slow motion on finish); the sim keeps its own rate. */
  timeScale = 1;
  private blendT = 1; private blendDur = 0.6;
  private fromPos = new THREE.Vector3(); private fromLook = new THREE.Vector3();
  private pos = new THREE.Vector3(); private look = new THREE.Vector3();
  private fr: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
  private gridS = 0;
  private finishT = 0; private slowT = 0; private orbitA0 = 0;
  private introStart = -1;
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3();
  private track: BakedTrack | null;
  cinematics = true;
  /** Dev only: `?cam=px,py,pz,tx,ty,tz` pins the camera (visual checks of kill planes, plazas, vistas). */
  private pinned: number[] | null = null;

  constructor(aspect: number, track: BakedTrack | null) {
    this.chase = new ChaseCamera(aspect);
    this.track = track;
    if (import.meta.env.DEV && typeof location !== 'undefined') {
      const v = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
      if (v && v.length === 6 && v.every(Number.isFinite)) this.pinned = v;
    }
    if (track && track.grid[0]) {
      const g = track.grid[0];
      const loc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 as 0 | 1 };
      track.locateGlobal(g.x, g.y, g.z, loc);
      this.gridS = loc.s;
    }
  }

  get camera(): THREE.PerspectiveCamera { return this.chase.camera; }

  /** Local kart crossed the line: FINISH slam + slow motion, then orbit. */
  onLocalFinish(): void {
    if (this.mode === 'finish') return;
    this.cut('finish');
    this.finishT = 0; this.slowT = 0.35;
    const c = this.chase.camera.position;
    this.orbitA0 = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
  }

  update(inp: DirectorInput): void {
    const cam = this.chase.camera;
    const t = inp.target;
    // slow motion window after the finish slam (real seconds)
    if (this.slowT > 0) { this.slowT -= inp.dt; this.timeScale = this.slowT > 0 ? 0.4 : 1; }
    const dt = inp.dt * this.timeScale;
    const introTicks = inp.goTick - inp.countdownTicks;
    let want: CamMode = 'chase';
    if (inp.finished) want = 'finish';
    else if (this.cinematics && inp.phase === 0 && this.track) {
      const left = introTicks - inp.tick;
      want = left > GRID_TICKS && introTicks >= GRID_TICKS + 45 ? 'intro' : 'grid';
    }
    if (want !== this.mode) this.cut(want);
    switch (this.mode) {
      case 'intro': this.intro(inp.tick, introTicks); break;
      case 'grid': this.gridShot(t, inp.tick, introTicks); break;
      case 'finish': this.finishOrbit(t, dt); break;
      default: {
        this.chase.update(t, dt);
        this.pos.copy(cam.position); this.chase.lookTarget(this.look);
      }
    }
    // blend from the previous rig's pose after a cut
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + inp.dt / this.blendDur);
      const k = this.blendT * this.blendT * (3 - 2 * this.blendT);
      this.pos.lerpVectors(this.fromPos, this.pos, k);
      this.look.lerpVectors(this.fromLook, this.look, k);
    }
    if (this.mode !== 'chase' || this.blendT < 1) {
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      if (this.mode !== 'chase') this.chase.applyFov(this.mode === 'intro' ? 58 : 62);
    }
    const p = this.pinned;
    if (p) { cam.position.set(p[0]!, p[1]!, p[2]!); cam.up.set(0, 1, 0); cam.lookAt(p[3]!, p[4]!, p[5]!); this.chase.applyFov(60); }
  }

  private cut(m: CamMode): void {
    this.fromPos.copy(this.chase.camera.position);
    this.chase.lookTarget(this.fromLook);
    if (this.mode !== 'chase') this.fromLook.copy(this.look);
    this.blendT = this.mode === 'intro' && m === 'grid' ? 0 : m === 'chase' ? 0 : m === 'finish' ? 0.2 : 1;
    this.blendDur = m === 'chase' ? 0.7 : 0.6;
    if (m === 'chase') this.chase.reset();
    if (m === 'intro') this.introStart = -1;
    this.mode = m;
  }

  /** Fly backwards down the track toward the grid at 12–20 m, ending behind the grid. */
  private intro(tick: number, introTicks: number): void {
    const tr = this.track!;
    if (this.introStart < 0) this.introStart = tick;
    const dur = Math.max(1, introTicks - GRID_TICKS - this.introStart);
    const u = THREE.MathUtils.clamp((tick - this.introStart) / dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    const L = tr.path(0).length;
    const s = this.gridS + 190 - e * 205;
    tr.frameAt(0, ((s % L) + L) % L, this.fr);
    const f = this.fr;
    const h = 20 - e * 8;
    const lat = Math.sin(u * Math.PI) * 9;
    this.pos.set(f.px + f.ux * h + f.rx * lat, f.py + f.uy * h + f.ry * lat, f.pz + f.uz * h + f.rz * lat);
    tr.frameAt(0, (((s - 38) % L) + L) % L, this.fr);
    this.look.set(this.fr.px, this.fr.py + 1.5, this.fr.pz);
  }

  /** Slow 60° orbit around the local kart, ending near the chase position. */
  private gridShot(t: CamTarget, tick: number, introTicks: number): void {
    const u = THREE.MathUtils.clamp(1 - (introTicks - tick) / GRID_TICKS, 0, 1);
    const e = u * u * (3 - 2 * u);
    const base = Math.atan2(t.fwd.x, t.fwd.z);
    const a = base + Math.PI + (1 - e) * 1.2;
    const r = 7.5 - e * 2.3, h = 2.6 - e * 0.7;
    this.pos.set(t.pos.x + Math.sin(a) * r, t.pos.y + h, t.pos.z + Math.cos(a) * r);
    this.look.copy(t.pos).addScaledVector(t.fwd, 2 + e * 4).add(this.tmp.set(0, 1.0, 0));
  }

  private finishOrbit(t: CamTarget, dt: number): void {
    this.finishT += dt;
    const a = this.orbitA0 + (this.finishT / 6) * Math.PI * 2;
    const r = 6 + Math.max(0, 0.35 - this.finishT) * 4;
    this.pos.set(t.pos.x + Math.sin(a) * r, t.pos.y + 2, t.pos.z + Math.cos(a) * r);
    this.look.copy(t.pos).add(this.tmp2.set(0, 0.8, 0));
  }
}
