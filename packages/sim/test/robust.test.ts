// Robustness (10-sim-spec §14.8): randomized drops never fall through the ground, and boosted karts never tunnel
// through walls. DROPS scales the drop count per track (default 10 000).
import { describe, expect, it } from 'vitest';
import type { BakedTrack, GroundHit } from '@cr/sim';
import { bakedTrack, type Rig } from './rig.ts';
import { flatPlane, corridor, cornerKit, halfpipe, helixKit, jumpKit } from './fixtures/kits.ts';
import { racingRig, place } from './util.ts';

const DROPS = Number(process.env.DROPS ?? 10000);

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

interface DropStats { drops: number; landed: number; killed: number; fallThrough: number; stuck: number }

/**
 * Drops karts at random (x, z) inside the track bounds, 0.5–20 m above the first ground below (or above the kill
 * plane where there is none), with random velocity. Every tick the displacement of each kart is ray-tested against
 * the ground: crossing a ground face downward without ending grounded on it is a fall-through.
 */
function dropTest(track: BakedTrack, n: number, seed: number): DropStats {
  const rnd = lcg(seed);
  const rig: Rig = racingRig(track, { slots: Array.from({ length: 8 }, () => ({})) });
  const [x0, y0, z0, x1, y1, z1] = track.meta.bounds;
  const hit: GroundHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
  const st: DropStats = { drops: 0, landed: 0, killed: 0, fallThrough: 0, stuck: 0 };
  const age = new Int32Array(8), px = new Float64Array(8), py = new Float64Array(8), pz = new Float64Array(8);
  const busy = new Uint8Array(8), landed = new Uint8Array(8), onGround = new Int32Array(8);
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
    k.race.finishTick = 1; // finished karts only respawn for kills (not off-graph), which is what a drop tests
    px[i] = b.px; py[i] = b.py; pz[i] = b.pz; age[i] = 0; busy[i] = 1; landed[i] = 0; onGround[i] = 0;
    st.drops++;
  };
  for (let i = 0; i < 8; i++) drop(i);
  while (st.drops < n || busy.some((x) => x === 1)) {
    const n0 = rig.events.length;
    rig.tick();
    const ev = rig.events.slice(n0);
    rig.events.length = 0;
    for (let i = 0; i < 8; i++) {
      if (!busy[i]) continue;
      const k = rig.w.karts[i]!, b = k.body;
      age[i] = age[i]! + 1;
      const dx = b.px - px[i]!, dy = b.py - py[i]!, dz = b.pz - pz[i]!, len = Math.hypot(dx, dy, dz);
      if (k.race.respawnPhase === 0 && len > 0.05 && track.groundRay(px[i]!, py[i]! + 0.02, pz[i]!, dx / len, dy / len, dz / len, len - 0.04, hit)) {
        // crossed a ground face going down: a fall-through leaves the kart under that surface (grazing the outer
        // edge of a ground sheet while falling past it ends outside the footprint and is not one)
        const hy = hit.y;
        if (!(b.grounded && Math.abs(b.py - hy) < 0.25) && track.groundRay(b.px, b.py + 2, b.pz, 0, -1, 0, 2, hit) && hit.y > b.py + 0.05) st.fallThrough++;
      }
      px[i] = b.px; py[i] = b.py; pz[i] = b.pz;
      let done = false;
      if (ev.some((e) => e.t === 'land' && e.kart === i)) landed[i] = 1;
      onGround[i] = b.grounded ? onGround[i]! + 1 : 0;
      if (ev.some((e) => e.t === 'respawn' && e.kart === i)) { st.killed++; done = true; }
      else if (landed[i] && onGround[i]! >= 3) { st.landed++; done = true; } // settled after the landing rebound
      else if (age[i]! > 240) { st.stuck++; done = true; }
      if (done) { busy[i] = 0; if (st.drops < n) drop(i); }
    }
  }
  return st;
}

describe('robustness: random drops (§14.8)', () => {
  const tracks: [string, () => BakedTrack][] = [
    ['flat plane', () => flatPlane().track],
    ['corridor 16 m', () => corridor(16).track],
    ['corner R12 90°', () => cornerKit(12, 90, 12).track],
    ['halfpipe 60°', () => halfpipe(60).track],
    ['stacked helix', () => helixKit(10, 2.5).track],
    ['jump', () => jumpKit(2, true).track],
    ['meadow_loop', () => bakedTrack('clayhill_village/meadow_loop')],
    ['proving_ring', () => bakedTrack('spark_circuit/proving_ring')],
  ];
  it.each(tracks)('%s: every drop lands on ground or triggers a kill respawn; no fall-through', (_name, mk) => {
    const s = dropTest(mk(), DROPS, 7);
    expect(s.fallThrough).toBe(0);
    expect(s.stuck).toBe(0);
    expect(s.landed + s.killed).toBe(s.drops);
    expect(s.landed).toBeGreaterThan(0);
  });
});

describe('robustness: boosted wall tunnelling (§10.4, R5)', () => {
  /** Drives at 45.3 m/s (team-boost speed) into a wall at `deg`; returns the worst penetration past the wall plane. */
  function ram(track: BakedTrack, s: number, u: number, deg: number, wallU: number, side: 1 | -1): number {
    const rig = racingRig(track);
    const k = place(rig, 0, { s, u, speed: 45.3, yawDeg: -side * deg });
    k.drive.boostTicks = 400; k.drive.boostKind = 2;
    let worst = -1e9;
    for (let t = 0; t < 90; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      worst = Math.max(worst, side * k.race.loc.u - wallU);
      if (k.race.respawnPhase !== 0) break;
    }
    return worst;
  }
  it.each([5, 10, 15, 20, 30, 45, 60, 75, 90])('corridor walls at %i° are never crossed', (deg) => {
    const t = corridor(16).track;
    expect(ram(t, 300, 0, deg, 8, 1)).toBeLessThan(0);
    expect(ram(t, 300, 0, deg, 8, -1)).toBeLessThan(0);
  });
  it.each([10, 45, 90])('corner inner/outer walls and halfpipe lips at %i° are never crossed', (deg) => {
    const c = cornerKit(12, 90, 12);
    expect(ram(c.track, c.arcStart + 5, 0, deg, 6, 1)).toBeLessThan(0);
    expect(ram(c.track, c.arcStart + 5, 0, deg, 6, -1)).toBeLessThan(0);
    const h = halfpipe(60);
    const top = h.floor + h.radius * Math.sin((60 * Math.PI) / 180);
    expect(ram(h.track, 300, 0, deg, top, 1)).toBeLessThan(0.05);
  });
});
