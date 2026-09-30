// firewall_hit (§3): on start the forward speed drops to ×0.35 and the kart bounces 3 m/s along the block normal
// (packed into the effect param by the contact); acceleration ×0.5 while active comes from the def mods.
import type { EffectBehavior } from '../behavior.ts';
import { unpackNormal } from '../pack.ts';

const N = { x: 0, z: 0 };
export const FIREWALL_SPEED_KEEP = 0.35, FIREWALL_BOUNCE = 3;

const behavior: EffectBehavior = {
  onStart(w, e) {
    const b = w.karts[e.victim]!.body;
    const u = b.vx * b.fx + b.vy * b.fy + b.vz * b.fz;
    const du = u * (FIREWALL_SPEED_KEEP - 1);
    b.vx += b.fx * du; b.vy += b.fy * du; b.vz += b.fz * du;
    if (e.param !== 0) {
      unpackNormal(e.param, N);
      b.vx += N.x * FIREWALL_BOUNCE; b.vz += N.z * FIREWALL_BOUNCE;
    }
  },
};

export default behavior;
