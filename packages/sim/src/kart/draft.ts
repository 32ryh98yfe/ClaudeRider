// Slipstream / draft (드래프트): charge 120 ticks in the cone, then a 90-tick burst (ADR-004).
import type { WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { evKey } from './evkey.ts';

export function updateDraft(w: WorldState, ctx: StepContext, chargeTicks: number, burstTicks: number): void {
  const K = w.karts;
  for (let i = 0; i < K.length; i++) {
    const a = K[i]!;
    if (!a.active || !a.body.grounded || a.race.respawnPhase !== 0) continue;
    const A = a.body, d = a.drive;
    const sa = Math.sqrt(A.vx * A.vx + A.vy * A.vy + A.vz * A.vz);
    let inCone = false;
    if (sa > 20 && d.draftTicks === 0) {
      const lx = A.ny * A.fz - A.nz * A.fy, ly = A.nz * A.fx - A.nx * A.fz, lz = A.nx * A.fy - A.ny * A.fx;
      for (let j = 0; j < K.length; j++) {
        if (j === i) continue;
        const c = K[j]!;
        if (!c.active) continue;
        const B = c.body;
        const sb = Math.sqrt(B.vx * B.vx + B.vy * B.vy + B.vz * B.vz);
        if (sb <= 20) continue;
        const dx = B.px - A.px, dy = B.py - A.py, dz = B.pz - A.pz;
        const along = dx * A.fx + dy * A.fy + dz * A.fz;
        if (along < 4 || along > 22) continue;
        const lat = dx * lx + dy * ly + dz * lz;
        if (lat > 2.2 || lat < -2.2) continue;
        inCone = true; break;
      }
    }
    if (inCone) {
      d.draftCharge++;
      if (d.draftCharge >= chargeTicks) {
        d.draftCharge = 0; d.draftTicks = burstTicks; a.stats.draftBursts++;
        ctx.events.push({ t: 'draftReady', kart: i, tick: w.tick, key: evKey(w.tick, 30, i) });
      }
    } else if (d.draftCharge > 0) {
      d.draftCharge = d.draftCharge > 2 ? d.draftCharge - 2 : 0;
    }
  }
}
