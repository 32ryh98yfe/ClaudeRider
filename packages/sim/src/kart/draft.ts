// Slipstream / draft (드래프트, 10-sim-spec §7.5): 120 ticks of charge in another kart's cone, then a 90-tick burst
// (vT = 1.05·vGrip, A0 ×1.1). step() calls this before dynamics with the end-of-last-tick positions, which is the
// spec's phase 7 of the previous tick, so slot order never matters. The burst is written +1 because the phase-3
// decrement follows in the same tick.
import { Attach, type KartState, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { evKey } from './evkey.ts';

const CONE_NEAR = 4, CONE_FAR = 22, CONE_LAT = 2.2, CONE_UP = 2.0, MIN_SPEED = 20;

/** Karts that neither give nor take slipstream: ghosted, respawning, finished, in warp transit or on a rail. */
function draftable(k: Readonly<KartState>): boolean {
  return k.active === 1 && k.body.ghostTicks <= 0 && k.race.respawnPhase === 0 && k.race.finishTick < 0 && k.race.retired === 0 && k.body.attachKind === Attach.NONE;
}

export function updateDraft(w: WorldState, ctx: StepContext, chargeTicks: number, burstTicks: number): void {
  const K = w.karts;
  for (let i = 0; i < K.length; i++) {
    const a = K[i]!;
    if (!draftable(a)) continue;
    const d = a.drive;
    if (d.draftTicks > 0) continue; // charge is frozen while the burst runs
    const A = a.body;
    const sa = Math.sqrt(A.vx * A.vx + A.vy * A.vy + A.vz * A.vz);
    let inCone = false;
    if (sa > MIN_SPEED) {
      for (let j = 0; j < K.length && !inCone; j++) {
        if (j === i) continue;
        const c = K[j]!;
        if (!draftable(c)) continue;
        const B = c.body;
        const sb = Math.sqrt(B.vx * B.vx + B.vy * B.vy + B.vz * B.vz);
        if (sb <= MIN_SPEED) continue;
        // cone behind the leader j, in j's frame
        const dx = B.px - A.px, dy = B.py - A.py, dz = B.pz - A.pz;
        const along = dx * B.fx + dy * B.fy + dz * B.fz;
        if (along < CONE_NEAR || along > CONE_FAR) continue;
        const lx = B.ny * B.fz - B.nz * B.fy, ly = B.nz * B.fx - B.nx * B.fz, lz = B.nx * B.fy - B.ny * B.fx;
        const lat = dx * lx + dy * ly + dz * lz;
        if (lat >= CONE_LAT || lat <= -CONE_LAT) continue;
        const up = dx * B.nx + dy * B.ny + dz * B.nz;
        if (up >= CONE_UP || up <= -CONE_UP) continue;
        inCone = true;
      }
    }
    if (inCone) {
      d.draftCharge++;
      if (d.draftCharge >= chargeTicks) {
        d.draftCharge = 0; d.draftTicks = burstTicks + 1; a.stats.draftBursts++;
        ctx.events.push({ t: 'draft', kart: i, on: true, tick: w.tick, key: evKey(w.tick, 30, i) });
        ctx.events.push({ t: 'draftReady', kart: i, tick: w.tick, key: evKey(w.tick, 32, i) });
      }
    } else if (d.draftCharge > 0) {
      d.draftCharge = d.draftCharge > 2 ? d.draftCharge - 2 : 0;
    }
  }
}
