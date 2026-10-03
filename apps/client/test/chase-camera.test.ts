import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { ChaseCamera, LEGACY_CHASE_CAMERA, REFERENCE_CHASE_CAMERA, type CamTarget } from '../src/render/camera/ChaseCamera.ts';

function target(): CamTarget {
  return { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), speed: 34, boosting: false, drift: 0, slip: 0, lookBack: false, airborne: false };
}
function settle(c: ChaseCamera, t: CamTarget, seconds = 3, fps = 60): void {
  for (let i = 0; i < seconds * fps; i++) c.update(t, 1 / fps);
  c.camera.updateMatrixWorld();
}
function screenY(c: ChaseCamera): number { return (1 - new THREE.Vector3(0, 0.5, 0).project(c.camera).y) / 2; }

describe('reference chase camera', () => {
  it.each([4 / 3, 16 / 9])('places the representative kart center near mid-frame at aspect %s', (aspect) => {
    const legacy = new ChaseCamera(aspect, LEGACY_CHASE_CAMERA), reference = new ChaseCamera(aspect);
    const t = target(); settle(legacy, t); settle(reference, t);
    // Source 4:3 gameplay framing: kart center typically y=.45–.52 on clear straights.
    expect(screenY(reference)).toBeGreaterThan(0.44);
    expect(screenY(reference)).toBeLessThan(0.53);
    expect(screenY(legacy) - screenY(reference)).toBeGreaterThan(0.1);
  });

  it('follows between the nose and travel heading, preserving visible drift angle', () => {
    const c = new ChaseCamera(4 / 3), t = target();
    const nose = 0.6;
    t.fwd.set(Math.sin(nose), 0, Math.cos(nose)); t.slip = nose; t.drift = 1;
    settle(c, t);
    const view = c.camera.getWorldDirection(new THREE.Vector3());
    const yaw = Math.atan2(view.x, view.z);
    expect(yaw).toBeGreaterThan(0.05);
    expect(yaw).toBeLessThan(nose - 0.05);
    // Camera work cannot modify the physical target supplied by the renderer.
    expect(t.pos.toArray()).toEqual([0, 0, 0]);
    expect(t.fwd.x).toBe(Math.sin(nose));
  });

  it('starts close during launch and opens to cruising framing as actual speed rises', () => {
    const c = new ChaseCamera(4 / 3), t = target();
    t.speed = 0; t.boosting = true; t.starting = true;
    c.update(t, 0); c.camera.updateMatrixWorld();
    const initialDistance = c.camera.position.distanceTo(t.pos);
    expect(initialDistance).toBeGreaterThan(2.5);
    expect(initialDistance).toBeLessThan(4);
    expect(screenY(c)).toBeGreaterThan(0.55);
    expect(screenY(c)).toBeLessThan(0.8);
    t.speed = 45; settle(c, t, 1.5);
    expect(c.camera.position.distanceTo(t.pos)).toBeGreaterThan(initialDistance + 2);
    expect(screenY(c)).toBeLessThan(0.55);
  });

  it('establishes the same close frame during countdown without an inward zoom after GO', () => {
    const c = new ChaseCamera(4 / 3), t = target();
    t.speed = 0; t.starting = true; t.boosting = false;
    settle(c, t, 3);
    const gridDistance = c.camera.position.distanceTo(t.pos);
    expect(gridDistance).toBeLessThan(3.5);
    t.boosting = true; t.speed = 2; c.update(t, 1 / 60);
    expect(c.camera.position.distanceTo(t.pos)).toBeGreaterThanOrEqual(gridDistance);
    expect(c.camera.position.distanceTo(t.pos) - gridDistance).toBeLessThan(0.02);
    t.speed = 45; settle(c, t, 1.5);
    expect(c.camera.position.distanceTo(t.pos)).toBeGreaterThan(gridDistance + 2);
  });

  it('widens and pulls back smoothly during boost, with comparable timing at 30 and 120 fps', () => {
    const cameras = [30, 120].map((fps) => {
      const c = new ChaseCamera(4 / 3), t = target(); settle(c, t, 3, fps);
      const oldFov = c.camera.fov, oldDistance = c.camera.position.distanceTo(t.pos);
      t.speed = 45; t.boosting = true; c.update(t, 1 / fps);
      expect(c.camera.fov).toBeGreaterThan(oldFov);
      expect(c.camera.fov).toBeLessThan(REFERENCE_CHASE_CAMERA.baseFov + REFERENCE_CHASE_CAMERA.boostFov);
      settle(c, t, 1 - 1 / fps, fps);
      expect(c.camera.position.distanceTo(t.pos)).toBeGreaterThan(oldDistance);
      return c;
    });
    expect(Math.abs(cameras[0]!.camera.fov - cameras[1]!.camera.fov)).toBeLessThan(0.01);
    expect(cameras[0]!.camera.position.distanceTo(cameras[1]!.camera.position)).toBeLessThan(0.02);
  });

  it('reduced motion suppresses FOV kick and shake, and reset follows teleports without a long world-space trail', () => {
    const c = new ChaseCamera(4 / 3), t = target(); c.reducedMotion = true;
    settle(c, t); const fov = c.camera.fov;
    t.speed = 50; t.boosting = true; c.shake(0.22); settle(c, t);
    expect(c.camera.fov).toBeCloseTo(fov, 3);
    t.pos.set(1000, 20, -1000); c.reset(); c.update(t, 1 / 60);
    expect(c.camera.position.distanceTo(t.pos)).toBeLessThan(10);
    expect(c.camera.position.toArray().every(Number.isFinite)).toBe(true);
    t.speed = 0; t.starting = true; c.reset(); c.update(t, 0);
    expect(c.camera.position.distanceTo(t.pos)).toBeGreaterThan(5); // no strong launch zoom in reduced motion
  });

  it('wraps heading through ±π without spinning the view around', () => {
    const c = new ChaseCamera(4 / 3), t = target();
    t.fwd.set(Math.sin(Math.PI - 0.01), 0, Math.cos(Math.PI - 0.01)); settle(c, t);
    const before = c.camera.position.clone();
    t.fwd.set(Math.sin(-Math.PI + 0.01), 0, Math.cos(-Math.PI + 0.01)); c.update(t, 1 / 60);
    expect(c.camera.position.distanceTo(before)).toBeLessThan(0.1);
  });

  it('rejects invalid presentation profiles before producing non-finite frames', () => {
    expect(() => new ChaseCamera(4 / 3, { ...REFERENCE_CHASE_CAMERA, distance: NaN })).toThrow('Invalid chase camera profile');
    expect(() => new ChaseCamera(4 / 3, { ...REFERENCE_CHASE_CAMERA, velocityHeadingMix: 2 })).toThrow('Invalid chase camera profile');
  });
});
