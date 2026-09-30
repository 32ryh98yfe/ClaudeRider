// Chase camera (30-art-bible §12): yaw spring on the heading (ω 6), closed-form critically damped spring on the
// camera's OFFSET from the kart (ω 9–10; stable for any dt and never lags 2v/ω behind at speed), ground-normal
// pitch follow (ω 4), speed pull-back, boost FOV kick 70→80 (τ 0.25 s), drift look-into, look-back, air lift,
// and a shake budget (trauma model, 12 Hz, 0.3 s decay). Reduced motion: no FOV kick, no shake.
import * as THREE from 'three/webgpu';

export interface CamTarget {
  pos: THREE.Vector3; fwd: THREE.Vector3; up: THREE.Vector3; speed: number; boosting: boolean;
  /** Drift direction (+1 left, −1 right, 0 none). */
  drift: number;
  lookBack: boolean; airborne: boolean;
  /** Signed slip angle (rad, + = nose left of velocity); drives the drift look-into. */
  slip?: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const wrap = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  reducedMotion = false;
  shakeEnabled = true;
  /** Base vertical FOV (deg). */
  baseFov = 70;
  private fov = 70;
  private yaw = 0; private yawVel = 0;
  private driftYaw = 0; private swing = 0;
  private init = false;
  private off = new THREE.Vector3(); private vel = new THREE.Vector3();
  private upS = new THREE.Vector3(0, 1, 0);
  private lookOff = new THREE.Vector3();
  private trauma = 0; private shakeAmp = 0; private shakeT = 0;
  private dist = 5.2; private height = 1.9;
  private dir = new THREE.Vector3(); private side = new THREE.Vector3(); private heightDir = new THREE.Vector3();
  private want = new THREE.Vector3(); private tmpA = new THREE.Vector3(); private tmpB = new THREE.Vector3(); private look = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.3, 3000);
  }

  /** Adds camera shake (metres). Shakes share one budget: the strongest active shake wins, capped at 0.22 m. */
  shake(amp: number): void {
    if (this.reducedMotion || !this.shakeEnabled) return;
    this.shakeAmp = Math.min(0.22, Math.max(this.shakeAmp * this.trauma, amp));
    this.trauma = 1;
  }

  /** Snap the springs (after a teleport or a camera cut). */
  reset(): void { this.init = false; }

  update(t: CamTarget, dt: number): void {
    const cam = this.camera;
    // ---- heading yaw spring (ω = 6), on the flattened kart forward
    const fx = t.fwd.x, fz = t.fwd.z;
    const heading = fx * fx + fz * fz > 1e-6 ? Math.atan2(fx, fz) : this.yaw;
    if (!this.init) { this.yaw = heading; this.yawVel = 0; }
    {
      const w = 6, e = Math.exp(-w * dt);
      const x = wrap(this.yaw - heading);
      const j = this.yawVel + w * x;
      this.yaw = heading + (x + j * dt) * e;
      this.yawVel = (this.yawVel - j * w * dt) * e;
    }
    // ---- drift look-into: yaw toward the inside by 0.35 × slip (≤ 14°), swing 0.8 m to the outside
    const slip = t.slip ?? t.drift * 0.35;
    const wantYaw = t.drift !== 0 ? THREE.MathUtils.clamp(slip * 0.35, -0.244, 0.244) : 0;
    const k3 = 1 - Math.exp(-3.5 * dt);
    this.driftYaw += (wantYaw - this.driftYaw) * k3;
    this.swing += ((t.drift !== 0 ? -t.drift * 0.8 : 0) - this.swing) * k3;
    const yaw = this.yaw + this.driftYaw;
    this.dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.side.crossVectors(UP, this.dir); // left of the camera heading
    // ---- ground-normal pitch follow (ω = 4) so loops and banks tilt the rig smoothly
    this.upS.lerp(t.up, 1 - Math.exp(-4 * dt)).normalize();
    this.heightDir.copy(UP).lerp(this.upS, 0.6).normalize();
    // ---- distances: 5.2 m back, 1.9 m up; +0.6 m in boost; −0.3 m below 10 m/s; +0.5 m up in the air
    const slowPull = t.speed < 10 ? 0.3 * (1 - t.speed / 10) : 0;
    const wantDist = 5.2 + (t.boosting ? 0.6 : 0) - slowPull;
    const wantH = 1.9 + (t.airborne ? 0.5 : 0);
    const kd = 1 - Math.exp(-4 * dt);
    this.dist += (wantDist - this.dist) * kd; this.height += (wantH - this.height) * kd;
    const want = this.want;
    if (t.lookBack) want.copy(this.dir).multiplyScalar(2.2).addScaledVector(this.heightDir, 1.6);
    else want.copy(this.dir).multiplyScalar(-this.dist).addScaledVector(this.heightDir, this.height).addScaledVector(this.side, this.swing);
    if (!this.init) { this.off.copy(want); this.vel.set(0, 0, 0); this.lookOff.set(0, 0, 0); this.init = true; }
    // ---- offset spring (critically damped, closed form)
    const w = t.boosting ? 10 : 9, e = Math.exp(-w * dt);
    const x = this.tmpA.copy(this.off).sub(want);
    const j = this.tmpB.copy(x).multiplyScalar(w).add(this.vel);
    this.off.copy(want).add(x.addScaledVector(j, dt).multiplyScalar(e));
    this.vel.addScaledVector(j, -w * dt).multiplyScalar(e);
    if (this.off.distanceToSquared(want) > 20 * 20) { this.off.copy(want); this.vel.set(0, 0, 0); } // teleport / long hitch
    cam.position.copy(t.pos).add(this.off);
    // ---- look-at: 1.2 m above the kart, 6 m ahead (behind when looking back)
    const lw = this.tmpA.copy(this.dir).multiplyScalar(t.lookBack ? -6 : 6).addScaledVector(this.heightDir, 1.2);
    if (this.lookOff.lengthSq() === 0) this.lookOff.copy(lw);
    this.lookOff.lerp(lw, 1 - Math.exp(-14 * dt));
    this.look.copy(t.pos).add(this.lookOff);
    // ---- shake: smooth multi-sine noise at ~12 Hz, amplitude ∝ trauma², 0.3 s decay
    if (this.trauma > 0) {
      this.shakeT += dt;
      this.trauma = Math.max(0, this.trauma - dt / 0.3);
      const a = this.shakeAmp * this.trauma * this.trauma;
      const s = this.shakeT * TAU * 12;
      cam.position.x += a * (Math.sin(s) * 0.6 + Math.sin(s * 1.73 + 1.3) * 0.4);
      cam.position.y += a * 0.7 * (Math.sin(s * 1.31 + 0.7) * 0.6 + Math.sin(s * 2.11 + 2.1) * 0.4);
      cam.position.z += a * 0.5 * Math.sin(s * 0.87 + 2.9);
    }
    cam.up.copy(this.heightDir);
    cam.lookAt(this.look);
    // ---- FOV: 70° base, 74° from 20 → 34 m/s, boost kick to 80° (τ 0.25 s); clamp horizontal FOV ≤ 120°
    const sp = THREE.MathUtils.clamp((t.speed - 20) / 14, 0, 1);
    const target = this.reducedMotion ? this.baseFov + 2 : this.baseFov + sp * 4 + (t.boosting ? 10 - sp * 4 : 0);
    this.fov += (target - this.fov) * (1 - Math.exp(-dt / 0.25));
    this.applyFov(this.fov);
  }

  /** Camera pose for other rigs to blend from. */
  lookTarget(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.look); }

  applyFov(v: number): void {
    const cam = this.camera;
    const maxV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(60)) / Math.max(0.1, cam.aspect)));
    const f = Math.min(v, maxV);
    if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
  }

  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
}
