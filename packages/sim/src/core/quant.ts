// FROZEN (contracts.lock). Quantization grids (ADR-003). quantizeWorld() is the LAST op of step().
import type { KartState, WorldState } from './state.ts';

export const Q = { POS: 4096, VEL: 4096, DIR: 32768, YAW: 4096, GAUGE: 65536, SLIP: 32768 } as const; // grid = 1/Q

const q = (x: number, k: number): number => Math.round(x * k) / k;

export function quantizeKart(k: KartState): void {
  const b = k.body;
  b.px = q(b.px, Q.POS); b.py = q(b.py, Q.POS); b.pz = q(b.pz, Q.POS);
  b.vx = q(b.vx, Q.VEL); b.vy = q(b.vy, Q.VEL); b.vz = q(b.vz, Q.VEL);
  b.fx = q(b.fx, Q.DIR); b.fy = q(b.fy, Q.DIR); b.fz = q(b.fz, Q.DIR);
  b.nx = q(b.nx, Q.DIR); b.ny = q(b.ny, Q.DIR); b.nz = q(b.nz, Q.DIR);
  b.yawRate = q(b.yawRate, Q.YAW);
  b.attachS = q(b.attachS, Q.POS);
  const d = k.drive;
  d.gauge = q(d.gauge, Q.GAUGE);
  d.driftPeak = q(d.driftPeak, Q.SLIP);
  const r = k.race;
  r.loc.s = q(r.loc.s, Q.POS); r.loc.u = q(r.loc.u, Q.POS); r.loc.h = q(r.loc.h, Q.POS); r.loc.sMain = q(r.loc.sMain, Q.POS);
  r.lastValid.s = q(r.lastValid.s, Q.POS); r.lastValid.u = q(r.lastValid.u, Q.POS); r.lastValid.h = q(r.lastValid.h, Q.POS); r.lastValid.sMain = q(r.lastValid.sMain, Q.POS);
  r.raceDist = q(r.raceDist, Q.POS);
  r.finishFrac = q(r.finishFrac, Q.GAUGE);
  k.stats.driftMeters = q(k.stats.driftMeters, 16);
}

export function quantizeWorld(w: WorldState): void {
  for (let i = 0; i < w.karts.length; i++) quantizeKart(w.karts[i]!);
  for (let i = 0; i < w.teams.length; i++) { const t = w.teams[i]!; t.gauge = q(t.gauge, Q.GAUGE); }
  for (let i = 0; i < w.projectiles.length; i++) {
    const p = w.projectiles[i]!;
    p.s = q(p.s, Q.POS); p.u = q(p.u, Q.POS); p.h = q(p.h, Q.POS); p.px = q(p.px, Q.POS); p.py = q(p.py, Q.POS); p.pz = q(p.pz, Q.POS);
  }
  for (let i = 0; i < w.hazards.length; i++) {
    const h = w.hazards[i]!;
    h.px = q(h.px, Q.POS); h.py = q(h.py, Q.POS); h.pz = q(h.pz, Q.POS); h.radius = q(h.radius, Q.POS);
  }
}
