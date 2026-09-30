// Chase camera: critically damped follow, speed pull-back, boost FOV kick (70→80), drift look-into, look-back, shake.
import * as THREE from 'three/webgpu';

export interface CamTarget { pos: THREE.Vector3; fwd: THREE.Vector3; up: THREE.Vector3; speed: number; boosting: boolean; drift: number; lookBack: boolean; airborne: boolean }

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private look = new THREE.Vector3();
  private fov = 70;
  private shakeT = 0;
  private shakeAmp = 0;
  private yawOff = 0;
  private init = false;
  private off = new THREE.Vector3();
  private lookOff = new THREE.Vector3();
  private tmpA = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  reducedMotion = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.3, 3000);
  }

  shake(amp: number): void { if (!this.reducedMotion) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = 0.35; } }

  update(t: CamTarget, dt: number): void {
    const cam = this.camera;
    const flatFwd = new THREE.Vector3(t.fwd.x, 0, t.fwd.z);
    if (flatFwd.lengthSq() < 1e-6) flatFwd.set(0, 0, 1);
    flatFwd.normalize();
    const sp01 = Math.min(1, t.speed / 44);
    this.yawOff += ((t.drift * 0.18) - this.yawOff) * Math.min(1, dt * 3);
    const dir = flatFwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yawOff);
    const dist = 5.2 + sp01 * 1.6 + (t.boosting ? 0.6 : 0);
    const height = 2.1 + sp01 * 0.4;
    const desired = new THREE.Vector3();
    if (t.lookBack) desired.copy(t.pos).addScaledVector(dir, 4.5).add(new THREE.Vector3(0, 1.8, 0));
    else desired.copy(t.pos).addScaledVector(dir, -dist).addScaledVector(t.up, height * 0.4).add(new THREE.Vector3(0, height * 0.6, 0));
    // spring the camera's offset from the kart (not its world position) so it never lags 2v/ω behind at speed
    const want = this.tmpC.copy(desired).sub(t.pos);
    if (!this.init) { this.off.copy(want); this.init = true; }
    // critically damped (ω = 9 rad/s; tighter while boosting), closed-form so any dt is stable
    const w = t.boosting ? 10 : 9;
    const e = Math.exp(-w * dt);
    const x = this.tmpA.copy(this.off).sub(want);
    const j = this.tmpB.copy(x).multiplyScalar(w).add(this.vel);
    this.off.copy(want).add(x.addScaledVector(j, dt).multiplyScalar(e));
    this.vel.addScaledVector(j, -w * dt).multiplyScalar(e);
    // a teleport (respawn) or a long hitch: snap instead of swinging in
    if (this.off.distanceToSquared(want) > 20 * 20) { this.off.copy(want); this.vel.set(0, 0, 0); }
    this.pos.copy(t.pos).add(this.off);
    cam.position.copy(this.pos);
    const lookTarget = t.lookBack ? t.pos.clone().addScaledVector(dir, -6).add(new THREE.Vector3(0, 1, 0)) : t.pos.clone().addScaledVector(dir, 3.5).addScaledVector(t.up, 1.1);
    const lookWant = lookTarget.sub(t.pos);
    if (this.lookOff.lengthSq() === 0) this.lookOff.copy(lookWant);
    this.lookOff.lerp(lookWant, 1 - Math.exp(-14 * dt));
    this.look.copy(t.pos).add(this.lookOff);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmp * (this.shakeT / 0.35);
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k * 0.6;
    }
    cam.lookAt(this.look);
    const targetFov = this.reducedMotion ? 72 : 70 + sp01 * 6 + (t.boosting ? 8 : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
}
