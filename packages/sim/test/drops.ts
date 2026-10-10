// Random-drop harness (10-sim-spec §14.8): drops karts at random (x, z) inside the track bounds, 0.5–20 m above the
// first ground below (or above the kill plane where there is none), with random velocity. Every tick each kart's
// displacement is ray-tested against the ground: crossing a ground face downward and ending *under* that surface
// is a fall-through. `debug` receives the last states of a kart when that happens.
import { Phase, type BakedTrack, type GroundHit } from '@cr/sim';
import type { Rig } from './rig.ts';
import { inJumpSpan, JUMP_AIR_GRACE_TICKS, NO_GROUND_RESPAWN } from '../src/race/progress.ts';
import { racingRig, place } from './util.ts';

export interface DropStats { drops: number; landed: number; killed: number; recoveredFromProp: number; fallThrough: number; stuck: number }

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function dropTest(track: BakedTrack, n: number, seed: number, debug?: (history: string[]) => void): DropStats {
  const rnd = lcg(seed);
  const rig: Rig = racingRig(track, { slots: Array.from({ length: 8 }, () => ({})) });
  const [x0, y0, z0, x1, y1, z1] = track.meta.bounds;
  const hit: GroundHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
  const st: DropStats = { drops: 0, landed: 0, killed: 0, recoveredFromProp: 0, fallThrough: 0, stuck: 0 };
  const age = new Int32Array(8), px = new Float64Array(8), py = new Float64Array(8), pz = new Float64Array(8);
  const busy = new Uint8Array(8), contacted = new Uint8Array(8), onGround = new Int32Array(8);
  const hist: string[][] = Array.from({ length: 8 }, () => []);
  const note = (i: number, s: string): void => { if (debug) { const h = hist[i]!; h.push(s); if (h.length > 40) h.shift(); } };
  const drop = (i: number): void => {
    const k = rig.w.karts[i]!;
    const x = x0 - 10 + rnd() * (x1 - x0 + 20), z = z0 - 10 + rnd() * (z1 - z0 + 20);
    const top = y1 + 30;
    const g = track.groundRay(x, top, z, 0, -1, 0, top - y0 + 30, hit) ? hit.y : y0 - 5;
    const h = 0.5 + rnd() * 19.5;
    place(rig, i, { s: 0, speed: 0 });
    const b = k.body;
    b.px = x; b.py = g + h; b.pz = z;
    b.vx = (rnd() - 0.5) * 30; b.vy = (rnd() - 0.7) * 15; b.vz = (rnd() - 0.5) * 30;
    b.nx = 0; b.ny = 1; b.nz = 0; b.grounded = 0; b.coyote = 0; b.airTicks = 1; b.ghostTicks = 1 << 30;
    track.locateGlobal(b.px, b.py, b.pz, k.race.loc);
    Object.assign(k.race.lastValid, k.race.loc);
    k.race.finishTick = -1; k.race.retired = 0;
    px[i] = b.px; py[i] = b.py; pz[i] = b.pz; age[i] = 0; busy[i] = 1; contacted[i] = 0; onGround[i] = 0;
    if (debug) hist[i] = [`drop ${st.drops} at (${x.toFixed(3)}, ${b.py.toFixed(3)}, ${z.toFixed(3)}) v(${b.vx.toFixed(2)}, ${b.vy.toFixed(2)}, ${b.vz.toFixed(2)}) ground ${g.toFixed(3)}`];
    st.drops++;
  };
  for (let i = 0; i < 8; i++) drop(i);
  while (st.drops < n || busy.some((x) => x === 1)) {
    // These are independent unscored drops, not a many-hour race. A finished-kart flag used to suppress
    // off-route resets here; v10 correctly brakes and parks that state. Keep the real dynamics/contact/kill
    // path active and explicitly suppress only race timeout/progress bookkeeping in this test harness.
    rig.w.phase = Phase.RACING; rig.w.goTick = rig.w.tick; rig.w.endTick = -1;
    for (const k of rig.w.karts) {
      k.race.finishTick = -1; k.race.retired = 0; k.race.lap = -1;
      k.race.offGraphTicks = 0; k.race.wrongWayTicks = 0;
      // Free falling still must reach real ground or a kill plane. A solid non-driving prop can catch the
      // kart, so exercise the real unsupported-body recovery timer there rather than freezing it forever.
      if (!contacted[k.slot]) k.race.noGroundTicks = 0;
    }
    const n0 = rig.events.length;
    rig.tick();
    const ev = rig.events.slice(n0);
    rig.events.length = 0;
    for (let i = 0; i < 8; i++) {
      if (!busy[i]) continue;
      const k = rig.w.karts[i]!, b = k.body;
      if (b.wallContact) contacted[i] = 1;
      age[i] = age[i]! + 1;
      if (debug) note(i, `a${age[i]} p(${b.px.toFixed(3)}, ${b.py.toFixed(3)}, ${b.pz.toFixed(3)}) v(${b.vx.toFixed(2)}, ${b.vy.toFixed(2)}, ${b.vz.toFixed(2)}) n(${b.nx.toFixed(2)}, ${b.ny.toFixed(2)}, ${b.nz.toFixed(2)}) gr ${b.grounded} wc ${b.wallContact} ${ev.filter((e) => 'kart' in e && e.kart === i).map((e) => e.t).join(',')}`);
      const dx = b.px - px[i]!, dy = b.py - py[i]!, dz = b.pz - pz[i]!, len = Math.hypot(dx, dy, dz);
      if (k.race.respawnPhase === 0 && len > 0.05 && track.groundRay(px[i]!, py[i]! + 0.02, pz[i]!, dx / len, dy / len, dz / len, len - 0.04, hit)) {
        // crossed a ground face going down: a fall-through leaves the kart under that surface (grazing the outer
        // edge of a ground sheet while falling past it ends outside the footprint and is not one)
        const hy = hit.y, where = `crossed y ${hy.toFixed(3)} n(${hit.nx.toFixed(2)}, ${hit.ny.toFixed(2)}, ${hit.nz.toFixed(2)}) tri ${hit.tri}`;
        if (!(b.grounded && Math.abs(b.py - hy) < 0.25) && track.groundRay(b.px, b.py + 2, b.pz, 0, -1, 0, 2, hit) && hit.y > b.py + 0.05) {
          st.fallThrough++;
          debug?.([...hist[i]!, `FALL: ${where}; surface above the end at y ${hit.y.toFixed(3)}`]);
        }
      }
      px[i] = b.px; py[i] = b.py; pz[i] = b.pz;
      let done = false;
      onGround[i] = b.grounded ? onGround[i]! + 1 : 0;
      if (ev.some((e) => e.t === 'respawn' && e.kart === i)) {
        if (k.race.noGroundTicks >= NO_GROUND_RESPAWN && b.py >= track.killY) st.recoveredFromProp++;
        else st.killed++;
        done = true;
      }
      // landed: grounded for 3 ticks (past any rebound) and a surface really is under the kart. Gentle touchdowns
      // after short hops emit no `land` event, so the event alone is not the criterion.
      else if (onGround[i]! >= 3 && track.groundRay(b.px + b.nx, b.py + b.ny, b.pz + b.nz, -b.nx, -b.ny, -b.nz, 1.05, hit)) { st.landed++; done = true; }
      // A non-driving prop inside a declared jump gets the game's actual 400-tick flight grace.
      // Other drops retain the original four-second limit; no ground-crossing check is suppressed.
      else if (age[i]! > (contacted[i] && inJumpSpan(track, k.race.loc) ? JUMP_AIR_GRACE_TICKS + 20 : 240)) { st.stuck++; done = true; debug?.([...hist[i]!, 'STUCK']); }
      if (done) { busy[i] = 0; if (st.drops < n) drop(i); }
    }
  }
  return st;
}
