// FROZEN (contracts.lock). FNV-1a hash over the quantized world (decisions excluded).
import type { KartState, WorldState } from './state.ts';

let H = 0;
function mixInt(v: number): void {
  // mix the low 32 bits and the high part of a (possibly > 2^32) integer
  let lo = v | 0;
  const hi = Math.floor(v / 4294967296) | 0;
  for (let i = 0; i < 4; i++) { H ^= lo & 0xff; H = Math.imul(H, 0x01000193); lo >>>= 8; }
  H ^= hi & 0xffff; H = Math.imul(H, 0x01000193);
}
const mixF = (x: number, k: number): void => mixInt(Math.round(x * k));

function hashKart(k: KartState): void {
  const b = k.body, d = k.drive, it = k.items, st = k.status, r = k.race;
  mixInt(k.slot); mixInt(k.team); mixInt(k.spec); mixInt(k.active);
  mixF(b.px, 4096); mixF(b.py, 4096); mixF(b.pz, 4096); mixF(b.vx, 4096); mixF(b.vy, 4096); mixF(b.vz, 4096);
  mixF(b.fx, 32768); mixF(b.fy, 32768); mixF(b.fz, 32768); mixF(b.nx, 32768); mixF(b.ny, 32768); mixF(b.nz, 32768);
  mixF(b.yawRate, 4096); mixInt(b.grounded); mixInt(b.coyote); mixInt(b.airTicks); mixInt(b.surf); mixInt(b.wallContact); mixInt(b.ghostTicks);
  mixInt(b.attachKind); mixInt(b.attachId); mixF(b.attachS, 4096); mixInt(b.attachT);
  mixInt(d.drift); mixInt(d.driftDir); mixInt(d.driftTicks); mixF(d.driftPeak, 32768); mixInt(d.reDriftLock); mixF(d.gauge, 65536);
  mixInt(d.fatigueTicks); mixInt(d.boosters); mixInt(d.teamBoosters); mixInt(d.boostTicks); mixInt(d.boostKind); mixInt(d.startTicks);
  mixInt(d.wheelspinTicks); mixInt(d.instWindow); mixInt(d.instTicks); mixInt(d.stunTicks); mixInt(d.draftCharge); mixInt(d.draftTicks);
  mixInt(d.prevHeld); mixInt(d.prevThrottle); mixInt(d.lowSpeedTicks); mixInt(d.startPressTick);
  mixInt(it.slot0); mixInt(it.slot1); mixInt(it.rouletteSlot); mixInt(it.rouletteEnd); mixInt(it.rouletteBox); mixInt(it.lastUseTick); mixInt(it.aimLockTicks); mixInt(it.aimTarget);
  mixInt(st.cc); mixInt(st.ccStart); mixInt(st.ccEnd); mixInt(st.immuneUntil); mixInt(st.shieldUntil); mixInt(st.shieldGraceUntil); mixInt(st.haloUntil);
  mixInt(st.mashCredits); mixInt(st.lastTapDir); mixInt(st.lastTapTick); mixInt(st.modMask);
  mixInt(r.loc.path); mixInt(r.loc.i); mixF(r.loc.s, 4096); mixF(r.loc.sMain, 4096); mixInt(r.lap); mixInt(r.keyMask); mixF(r.raceDist, 4096);
  mixInt(r.finishTick); mixInt(r.rank); mixInt(r.wrongWayTicks); mixInt(r.respawnPhase); mixInt(r.respawnUntil); mixInt(r.slowTicks); mixInt(r.retired);
}

export function hashWorld(w: Readonly<WorldState>): number {
  H = 0x811c9dc5 | 0;
  mixInt(w.tick); mixInt(w.phase); mixInt(w.goTick); mixInt(w.firstFinishTick); mixInt(w.endTick); mixInt(w.seq); mixInt(w.nextObjId);
  for (const k of w.karts) hashKart(k);
  for (const t of w.teams) { mixF(t.gauge, 65536); mixInt(t.granted); }
  for (const e of w.effects) { mixInt(e.id); mixInt(e.code); mixInt(e.victim); mixInt(e.source); mixInt(e.start); mixInt(e.end); mixInt(e.param); mixInt(e.flags); mixInt(e.result); }
  for (const p of w.projectiles) { mixInt(p.id); mixInt(p.code); mixInt(p.owner); mixInt(p.target); mixInt(p.phase); mixInt(p.path); mixF(p.s, 4096); mixF(p.u, 4096); mixF(p.h, 4096); mixInt(p.spawn); mixInt(p.commit); mixInt(p.impact); }
  for (const h of w.hazards) { mixInt(h.id); mixInt(h.code); mixInt(h.owner); mixF(h.px, 4096); mixF(h.py, 4096); mixF(h.pz, 4096); mixInt(h.arm); mixInt(h.expire); mixInt(h.flags); }
  for (let i = 0; i < w.boxRespawn.length; i++) mixInt(w.boxRespawn[i]!);
  return H >>> 0;
}
