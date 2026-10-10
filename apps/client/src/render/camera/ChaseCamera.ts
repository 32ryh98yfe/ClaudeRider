// Chase camera: a calibrated framing/heading profile over closed-form springs. Springs operate on the camera's
// OFFSET, never its world position, so movement does not create a speed-dependent following gap. Camera
// calibration is independent of physics. Reduced motion disables speed/boost FOV changes and impact shake.
import * as THREE from 'three/webgpu';
import { V_REF, V_BOOST } from '@cr/sim';

export interface CamTarget {
  pos: THREE.Vector3; fwd: THREE.Vector3; up: THREE.Vector3; speed: number; boosting: boolean;
  /** Drift direction (+1 left, −1 right, 0 none). */
  drift: number;
  lookBack: boolean; airborne: boolean;
  /** Signed slip angle (rad, + = nose left of velocity); drives the drift look-into. */
  slip?: number;
  /** Launch boost only; ordinary boost keeps the cruising frame. */
  starting?: boolean;
  /** Actual motor targets for the current kart, in m/s (presentation normalization only). */
  gripSpeed?: number; boostSpeed?: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const wrap = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);

/** Presentation-only calibration. Distances are metres, angular responses are per second, FOV is vertical. */
export interface ChaseCameraProfile {
  distance: number; height: number; lookAhead: number; lookHeight: number;
  yawResponse: number;
  /** 0 follows the nose; 1 follows the velocity direction reconstructed from the signed slip. */
  velocityHeadingMix: number;
  driftLookMix: number; driftLookLimit: number; driftSwing: number;
  boostPullback: number; baseFov: number; speedFov: number; boostFov: number; overSpeedFov: number;
  launchPullIn: number; launchLookAhead: number;
}

/** The previous rig is retained to make baseline captures and framing tests reproducible. */
export const LEGACY_CHASE_CAMERA: Readonly<ChaseCameraProfile> = Object.freeze({
  distance: 5.2, height: 1.9, lookAhead: 6, lookHeight: 1.2, yawResponse: 6,
  velocityHeadingMix: 0, driftLookMix: 0.35, driftLookLimit: 0.244, driftSwing: 0.8,
  boostPullback: 0.6, baseFov: 70, speedFov: 4, boostFov: 10, overSpeedFov: 3,
  launchPullIn: 0, launchLookAhead: 0,
});

/** Calibrated against the source's 4:3 gameplay area, independently of the simulation's speed scale. */
export const REFERENCE_CHASE_CAMERA: Readonly<ChaseCameraProfile> = Object.freeze({
  distance: 6.2, height: 2.1, lookAhead: 0.5, lookHeight: 0.1, yawResponse: 7,
  velocityHeadingMix: 0.45, driftLookMix: 0.08, driftLookLimit: 0.14, driftSwing: 0.25,
  boostPullback: 0.5, baseFov: 66, speedFov: 4, boostFov: 7, overSpeedFov: 2,
  launchPullIn: 3.8, launchLookAhead: 1.2,
});

function defaultProfile(): Readonly<ChaseCameraProfile> {
  // Only the development reference runner can select the old camera; normal play uses the calibrated rig.
  if (import.meta.env?.DEV && typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search);
    if (q.has('reference') && q.get('referenceCamera') === 'legacy') return LEGACY_CHASE_CAMERA;
  }
  return REFERENCE_CHASE_CAMERA;
}

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly profileName: 'legacy' | 'reference' | 'custom';
  reducedMotion = false;
  shakeEnabled = true;
  /** Settings → camera distance: scales the follow distance and height (near 0.82, normal 1, far 1.22). */
  distanceScale = 1;
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

  private readonly profile: Readonly<ChaseCameraProfile>;

  constructor(aspect: number, profile: Readonly<ChaseCameraProfile> = defaultProfile()) {
    if (Object.values(profile).some((v) => !Number.isFinite(v)) || profile.distance <= 0 || profile.height <= 0 || profile.yawResponse <= 0 || profile.velocityHeadingMix < 0 || profile.velocityHeadingMix > 1 || profile.baseFov <= 0 || profile.baseFov >= 120) throw new Error('Invalid chase camera profile');
    this.profile = Object.freeze({ ...profile });
    this.profileName = profile === LEGACY_CHASE_CAMERA ? 'legacy' : profile === REFERENCE_CHASE_CAMERA ? 'reference' : 'custom';
    this.baseFov = profile.baseFov; this.fov = profile.baseFov; this.dist = profile.distance; this.height = profile.height;
    this.camera = new THREE.PerspectiveCamera(profile.baseFov, aspect, 0.3, 3000);
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
    const p = this.profile;
    const legacy = this.profileName === 'legacy';
    const gripSpeed = legacy ? 34 : Math.max(1, t.gripSpeed ?? V_REF);
    const boostSpeed = legacy ? 45 : Math.max(gripSpeed + 0.01, t.boostSpeed ?? V_BOOST);
    const slip = t.slip ?? t.drift * 0.35;
    // ---- heading yaw spring, blending nose and travel direction during slip
    const fx = t.fwd.x, fz = t.fwd.z;
    const nose = fx * fx + fz * fz > 1e-6 ? Math.atan2(fx, fz) : this.yaw;
    // The rendering target reports nose-left-of-velocity slip: velocity yaw is nose yaw minus slip.
    const heading = nose - slip * p.velocityHeadingMix;
    if (!this.init) { this.yaw = heading; this.yawVel = 0; }
    {
      const w = p.yawResponse, e = Math.exp(-w * dt);
      const x = wrap(this.yaw - heading);
      const j = this.yawVel + w * x;
      this.yaw = heading + (x + j * dt) * e;
      this.yawVel = (this.yawVel - j * w * dt) * e;
    }
    // ---- bounded drift look-into and outward swing
    const wantYaw = t.drift !== 0 ? THREE.MathUtils.clamp(slip * p.driftLookMix, -p.driftLookLimit, p.driftLookLimit) : 0;
    const k3 = 1 - Math.exp(-3.5 * dt);
    this.driftYaw += (wantYaw - this.driftYaw) * k3;
    this.swing += ((t.drift !== 0 ? -t.drift * p.driftSwing : 0) - this.swing) * k3;
    const yaw = this.yaw + this.driftYaw;
    this.dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.side.crossVectors(UP, this.dir); // left of the camera heading
    // ---- ground-normal pitch follow (ω = 4) so loops and banks tilt the rig smoothly
    this.upS.lerp(t.up, 1 - Math.exp(-4 * dt)).normalize();
    this.heightDir.copy(UP).lerp(this.upS, 0.6).normalize();
    // ---- speed pull-back; −0.3 m below 10 m/s and +0.5 m height in the air
    const slowPull = t.speed < 10 ? 0.3 * (1 - t.speed / 10) : 0;
    const ds = this.distanceScale;
    // The reference begins close to the kart, then opens the view as launch speed rises.
    // Drive this from actual launch/speed state so normal play and replay use the same presentation.
    const launch = t.starting && !this.reducedMotion ? THREE.MathUtils.clamp(1 - t.speed / boostSpeed, 0, 1) : 0;
    const wantDist = (p.distance + (t.boosting ? p.boostPullback : 0) - slowPull - p.launchPullIn * launch) * ds;
    const wantH = (p.height + (t.airborne ? 0.5 : 0)) * (0.6 + 0.4 * ds);
    if (!this.init && launch > 0 && p.launchPullIn > 0) { this.dist = wantDist; this.height = wantH; }
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
    // ---- near-kart framing keeps the racer near the source footage's vertical center
    const lw = this.tmpA.copy(this.dir).multiplyScalar(t.lookBack ? -6 : p.lookAhead + launch * p.launchLookAhead).addScaledVector(this.heightDir, p.lookHeight);
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
    // ---- smooth speed/boost FOV cue; clamp horizontal FOV ≤ 120° on wide viewports
    const slowSpeed = gripSpeed * (20 / 34);
    const sp = THREE.MathUtils.clamp((t.speed - slowSpeed) / (gripSpeed - slowSpeed), 0, 1);
    const hi = THREE.MathUtils.clamp((t.speed - boostSpeed) / (boostSpeed * (6 / 45)), 0, 1);
    // A boost press alone does not pretend the kart has already reached its boost speed.
    const boostProgress = t.boosting ? THREE.MathUtils.clamp((t.speed - gripSpeed) / (boostSpeed - gripSpeed), 0, 1) : 0;
    const boostCue = legacy ? (t.boosting ? p.boostFov - sp * p.speedFov : 0) : boostProgress * (p.boostFov - p.speedFov);
    const target = this.reducedMotion ? this.baseFov + 2 : this.baseFov + sp * p.speedFov + boostCue + hi * p.overSpeedFov;
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
