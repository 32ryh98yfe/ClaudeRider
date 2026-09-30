// F6: helix ≥ 360° with stacked decks (V2), LOOP with RMF frames and track gravity, per-span low gravity.
import { describe, expect, it } from 'vitest';
import { AI_TIERS, SFLAG, createAiDriver, type GravityOut, type TrackLoc } from '@cr/sim';
import { readFileSync } from 'node:fs';
import { TRACKS, bake, bakeSrc, frame, hit, reload } from './helpers.ts';
import { getContent, simRig } from './simrig.ts';

const r = bake('_test/f6_helix.ctd');
const t = reload(r);
const prim = (line: number): { s0: number; s1: number } => {
  const q = r.model.paths[0]!.prims.find((p) => p.line === line)!;
  const s0 = r.model.toMain(q.s0);
  return { s0, s1: s0 + q.len };
};
const HELIX = prim(11), LOOP = prim(15), LOWG = prim(17);
const loc = (): TrackLoc => ({ path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 });
const grav = (): GravityOut => ({ x: 0, y: 0, z: 0, scale: 1 });

describe('F6 helix / loop fixture', () => {
  it('bakes with zero errors; the 540° helix really stacks (V2 counts stacked pairs, none too close)', () => {
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(r.findings.some((f) => f.rule === 'V2')).toBe(false);
    expect(HELIX.s1 - HELIX.s0).toBeCloseTo(Math.PI * 30 * 3, 0);
  });

  it('two decks at one plan point: a ray from above hits the upper turn, one from between the decks the lower', () => {
    const f = frame(), g = frame(), h = hit();
    const sA = HELIX.s0 + 40, sB = sA + (HELIX.s1 - HELIX.s0) * (2 / 3); // 360° later, same plan point
    t.frameAt(0, sA, f); t.frameAt(0, sB, g);
    expect(Math.hypot(f.px - g.px, f.pz - g.pz)).toBeLessThan(0.5);
    const sep = f.py - g.py;
    expect(sep).toBeGreaterThan(8);
    expect(t.groundRay(f.px, f.py + 3, f.pz, 0, -1, 0, 6, h)).toBe(true);
    expect(h.y).toBeCloseTo(f.py, 0);
    expect(t.groundRay(g.px, g.py + 3, g.pz, 0, -1, 0, 6, h)).toBe(true);
    expect(h.y).toBeCloseTo(g.py, 0);
  });

  it('locate keeps each deck: a kart 0.5 m above either turn locates onto that turn', () => {
    const f = frame(), g = frame(), prev = loc(), out = loc();
    const sA = HELIX.s0 + 60, sB = sA + (HELIX.s1 - HELIX.s0) * (2 / 3);
    t.frameAt(0, sA, f); t.frameAt(0, sB, g);
    t.locateGlobal(f.px, f.py + 0.5, f.pz, prev);
    expect(Math.abs(prev.s - sA)).toBeLessThan(1);
    t.locateGlobal(g.px, g.py + 0.5, g.pz, prev);
    expect(Math.abs(prev.s - sB)).toBeLessThan(1);
    // graph-local: from just behind each deck
    t.locateGlobal(f.px, f.py + 0.5, f.pz, prev);
    expect(t.locate(f.px, f.py + 0.5, f.pz, prev, out)).toBe(true);
    expect(Math.abs(out.s - sA)).toBeLessThan(1);
  });

  it('the loop is RMF-framed with track gravity: the up vector points down at the top, gravity follows it', () => {
    const f = frame(), g = grav(), l = loc();
    let minUy = 1, sTop = 0;
    for (let s = LOOP.s0; s <= LOOP.s1; s += 0.5) { t.frameAt(0, s, f); if (f.uy < minUy) { minUy = f.uy; sTop = s; } }
    expect(minUy).toBeLessThan(-0.95);
    t.frameAt(0, sTop, f);
    expect(f.flags & SFLAG.RMF).toBeTruthy();
    expect((f.flags & SFLAG.GRAV_MASK) >> SFLAG.GRAV_SHIFT).toBe(1);
    t.locateGlobal(f.px + f.ux * 0.5, f.py + f.uy * 0.5, f.pz + f.uz * 0.5, l);
    expect(Math.abs(l.s - sTop)).toBeLessThan(1.5);
    t.gravityAt(l, g);
    const gx = g.x, gy = g.y, gz = g.z, gl = Math.hypot(gx, gy, gz);
    expect(gl).toBeGreaterThan(20);
    // gravity pulls into the track (−up), i.e. world-up at the top of the loop
    expect((gx * f.ux + gy * f.uy + gz * f.uz) / gl).toBeLessThan(-0.95);
  });

  it('the loop exit is shifted laterally by `shift` so it passes beside its own entry', () => {
    const a = frame(), b = frame();
    t.frameAt(0, LOOP.s0, a); t.frameAt(0, LOOP.s1, b);
    const lat = (b.px - a.px) * a.rx + (b.pz - a.pz) * a.rz;
    expect(Math.abs(Math.abs(lat) - 18)).toBeLessThan(0.5);
    expect(Math.abs(b.py - a.py)).toBeLessThan(0.05);
  });

  it('gravity=low:0.5 scales gravity on its span only', () => {
    const g = grav(), l = loc(), f = frame();
    const mag = (s: number): number => {
      t.frameAt(0, s, f); t.locateGlobal(f.px, f.py + 0.3, f.pz, l); t.gravityAt(l, g);
      return Math.hypot(g.x, g.y, g.z);
    };
    const inside = mag((LOWG.s0 + LOWG.s1) / 2), outside = mag(LOWG.s0 - 30);
    expect(inside / outside).toBeCloseTo(0.5, 2);
  });

  it('an AI kart laps the fixture (helix down, loop, low-g span) without a respawn or a deck jump (sim)', () => {
    const rig = simRig(t, 1);
    const ai = createAiDriver(t, getContent(), 0, AI_TIERS.pro, {}, 7);
    const k = rig.w.karts[0]!;
    let prev = k.race.loc.sMain, maxStep = 0;
    for (let i = 0; i < 60 * 150 && k.race.finishTick < 0; i++) {
      rig.tick(1, (w, inp) => ai.decide(w, inp));
      let d = k.race.loc.sMain - prev;
      if (d < -t.lapLength / 2) d += t.lapLength;
      if (k.race.loc.valid) { if (Math.abs(d) > maxStep) maxStep = Math.abs(d); prev = k.race.loc.sMain; }
    }
    expect(k.stats.respawns).toBe(0);
    expect(k.race.finishTick).toBeGreaterThan(0);
    expect(maxStep).toBeLessThan(3); // ≤ ~1.4 m per tick at 80 m/s; a deck jump would be ≥ 188 m
  });
});

describe('V2 stacked decks (seeded violation)', () => {
  it('the fixture helix with 7.3 m per turn (dy −11 over 540°) is rejected; 10.7 m per turn passes', () => {
    const base = readFileSync(TRACKS + '_test/f6_helix.ctd', 'utf8');
    const src = (dy: number): string => base.replace('HELIX R30 540 L dy=-16', `HELIX R30 540 L dy=${-dy}`).replace('S ?c dy=+17', `S ?c dy=+${dy + 1}`);
    const bad = bakeSrc(src(11)).findings.filter((f) => f.rule === 'V2');
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0]!.msg).toMatch(/vertical separation/);
    expect(bakeSrc(src(16)).findings.filter((f) => f.rule === 'V2')).toEqual([]);
  });
});

describe('V7 frame mode (seeded violation)', () => {
  it('forcing frame=worldUp through the loop is rejected', () => {
    const base = readFileSync(TRACKS + '_test/f6_helix.ctd', 'utf8');
    const bad = bakeSrc(base.replace('LOOP R12 shift=18 ease=15', 'LOOP R12 shift=18 ease=15 frame=worldUp')).findings.filter((f) => f.rule === 'V7');
    expect(bad.map((f) => f.msg)).toEqual([expect.stringMatching(/frame=worldUp where \|T·Y\| > 0.9/)]);
  });
});

describe('CLOVERLEAF', () => {
  const src = `TRACK clover name="Clover" theme=spark_circuit diff=3 laps=3 topo=circuit
DEFAULTS w=12 surf=asphalt wall=barrier:1.0 blend=15
START pos=(0,0,0) hdg=0
S ?a
CLOVERLEAF levels=0/9/18 R=35
S 150
C R40 90 L
S 300 dy=-18
C R40 90 L
S ?b
C R40 90 L
CLOSE solve=[?a,?b]
`;
  const c = bakeSrc(src), ct = reload(c);
  it('expands to stacked 270° ramps: turning number 2 is accepted because every crossing is stacked', () => {
    expect(c.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(Math.round(c.model.paths[0]!.turn / 360)).toBe(2);
    expect(c.meta.bounds[4]! - c.meta.bounds[1]!).toBeGreaterThan(17.5);
  });
  it('where a ramp crosses its own entry the two decks are ≥ 8 m apart and both are solid', () => {
    const S = c.model.paths[0]!.samples, L = c.model.paths[0]!.length, h = hit();
    let found = false;
    for (let i = 0; i < S.length && !found; i += 2) for (let j = i + 40; j < S.length && !found; j += 2) {
      const a = S[i]!, b = S[j]!;
      const gd = Math.min(Math.abs(a.s - b.s), L - Math.abs(a.s - b.s));
      if (gd < 60 || Math.hypot(a.x - b.x, a.z - b.z) > 0.8) continue;
      const [lo, hi] = a.y < b.y ? [a, b] : [b, a];
      expect(hi.y - lo.y).toBeGreaterThanOrEqual(8);
      expect(ct.groundRay(hi.x, hi.y + 2, hi.z, 0, -1, 0, 4, h)).toBe(true);
      expect(h.y).toBeCloseTo(hi.y, 0);
      expect(ct.groundRay(lo.x, lo.y + 2, lo.z, 0, -1, 0, 4, h)).toBe(true);
      expect(h.y).toBeCloseTo(lo.y, 0);
      found = true;
    }
    expect(found).toBe(true);
  });
});

describe('gap-3 Magma fixture (verbatim)', () => {
  // The research example predates the D-band width rule (9–10 m corners, blend 12), puts a key 3 m past the ledge merge
  // and ends its rail with a 3.5 m / 6 m lateral step (V17 exit 14.6°); those rules are the roster lane's to satisfy.
  const b = bake('_fixtures/magma_switchback.ctd', { terrain: false, props: false });
  it('compiles, closes exactly and solves the three gap-3 straights', () => {
    expect(Math.hypot(b.model.closure.dx, b.model.closure.dz)).toBeLessThan(0.01);
    expect(Math.abs(b.model.closure.dy)).toBeLessThan(0.01);
    expect(b.model.solved['?a']).toBeCloseTo(8.2, 1);
    expect(b.model.solved['?b']).toBeCloseTo(81.64, 1);
    expect(b.model.solved['?c']).toBeCloseTo(1.51, 1);
    expect(b.model.paths[0]!.length).toBeCloseTo(1850, 3);
  });
  it('matches the derived checks: helix 263.9 m, elevation 8.5–30 m, stacked with no V2/V1/V11 findings', () => {
    const helix = b.model.paths[0]!.prims.find((q) => q.line === 9)!;
    expect(helix.len).toBeCloseTo(263.9, 1);
    expect(b.meta.bounds[1]).toBeCloseTo(8.5, 1);
    expect(b.meta.bounds[4]).toBeCloseTo(30, 1);
    expect(Math.round(b.model.paths[0]!.turn / 360)).toBe(2);
    expect(b.findings.filter((f) => ['V0', 'V1', 'V2', 'V3', 'V11', 'V12'].includes(f.rule) && f.severity === 'error')).toEqual([]);
    expect(b.model.paths.find((p) => p.id === 'ledge')!.length).toBeCloseTo(203.8, 1);
    expect(b.meta.hazards.map((h) => [h.kind, h.offsetTicks])).toEqual([['geyser', 0], ['geyser', 72], ['geyser', 144]]);
  });
});

