// Spatial-audio listener (the race camera). The renderer writes it every frame; the audio engine applies it to
// the AudioContext listener and uses it for engine-voice panning and Doppler.
import type { Vec3 } from './api.ts';

export const listener = {
  pos: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 },
  valid: false,
};

export function setListener(pos: Vec3, fwd: Vec3, up: Vec3, vel: Vec3): void {
  const L = listener;
  L.pos.x = pos.x; L.pos.y = pos.y; L.pos.z = pos.z;
  L.fwd.x = fwd.x; L.fwd.y = fwd.y; L.fwd.z = fwd.z;
  L.up.x = up.x; L.up.y = up.y; L.up.z = up.z;
  L.vel.x = vel.x; L.vel.y = vel.y; L.vel.z = vel.z;
  L.valid = true;
}

/** Pushes the listener pose into the Web Audio listener (smoothed a little so HRTF panning never zippers). */
export function applyListener(ac: BaseAudioContext): void {
  const al = ac.listener, L = listener, t = ac.currentTime;
  if (!L.valid) return;
  if (al.positionX) {
    al.positionX.setTargetAtTime(L.pos.x, t, 0.02); al.positionY.setTargetAtTime(L.pos.y, t, 0.02); al.positionZ.setTargetAtTime(L.pos.z, t, 0.02);
    al.forwardX.setTargetAtTime(L.fwd.x, t, 0.02); al.forwardY.setTargetAtTime(L.fwd.y, t, 0.02); al.forwardZ.setTargetAtTime(L.fwd.z, t, 0.02);
    al.upX.setTargetAtTime(L.up.x, t, 0.02); al.upY.setTargetAtTime(L.up.y, t, 0.02); al.upZ.setTargetAtTime(L.up.z, t, 0.02);
  } else {
    (al as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(L.pos.x, L.pos.y, L.pos.z);
    (al as unknown as { setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void }).setOrientation(L.fwd.x, L.fwd.y, L.fwd.z, L.up.x, L.up.y, L.up.z);
  }
}

/** Distance from the listener. */
export function listenerDist(p: Vec3): number {
  const dx = p.x - listener.pos.x, dy = p.y - listener.pos.y, dz = p.z - listener.pos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Equal-power pan (−1 left … +1 right) of a point relative to the listener. */
export function listenerPan(p: Vec3): number {
  const L = listener;
  // right = fwd × up
  const rx = L.fwd.y * L.up.z - L.fwd.z * L.up.y, ry = L.fwd.z * L.up.x - L.fwd.x * L.up.z, rz = L.fwd.x * L.up.y - L.fwd.y * L.up.x;
  const dx = p.x - L.pos.x, dy = p.y - L.pos.y, dz = p.z - L.pos.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return Math.max(-1, Math.min(1, (dx * rx + dy * ry + dz * rz) / d));
}

/** Radial velocity of a source toward the listener (m/s, + = approaching) for Doppler. */
export function radialSpeed(p: Vec3, v: Vec3): number {
  const L = listener;
  const dx = L.pos.x - p.x, dy = L.pos.y - p.y, dz = L.pos.z - p.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const rvx = v.x - L.vel.x, rvy = v.y - L.vel.y, rvz = v.z - L.vel.z;
  return (rvx * dx + rvy * dy + rvz * dz) / d;
}
