// F1: branches (split/merge, progress mapping, gores), boost/jump pads, per-segment and per-zone surfaces, conveyors,
// noItem zones and PROPS placement rules — checked through the baked binary like the sim sees it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CVIS_MAGIC, CVIS_VERSION, SFLAG, TFLAG, readContainer, toArrayBuffer, type TrackLoc } from '@cr/sim';
import { buildTrack } from '../src/build.ts';
import { TRACKS, bake, contacts, frame, hit, locateWalk, reload, surfaceAt, surfCode, sweep } from './helpers.ts';

const r = bake('_test/f1_branch.ctd');
const t = reload(r);
const cut = t.meta.paths.findIndex((p) => p.id === 'cut');

describe('F1 branch fixture', () => {
  it('bakes with zero errors, two paths and a mapped branch', () => {
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(cut).toBe(1);
    const b = t.path(cut);
    expect(b.kind).toBe('branch');
    expect(b.map!.host).toBe(0);
    expect(b.map!.toS).toBeGreaterThan(b.map!.fromS);
    expect(b.links!.map((l) => l.kind)).toEqual(['split', 'merge']);
    expect(t.path(0).links!.filter((l) => l.to === cut).length).toBe(2);
    // shortcut: its mapped span is longer than the branch itself
    expect(b.map!.toS - b.map!.fromS).toBeGreaterThan(b.length + 10);
  });

  it('every path is drivable: ground everywhere and no wall on the centreline or near the edges', () => {
    expect(sweep(t, 0, [0, -0.55, 0.55])).toBeNull();
    expect(sweep(t, cut, [0, -0.5, 0.5])).toBeNull();
  });

  it('walls stand outside the junction windows and the split gore is a soft cushion', () => {
    const f = frame(), cs = contacts();
    t.frameAt(0, 300, f);
    const d = f.wR - 0.2;
    expect(t.sphereWalls(f.px + f.rx * d + f.ux * 0.6, f.py + f.ry * d + f.uy * 0.6, f.pz + f.rz * d + f.uz * 0.6, 0.85, cs, 8)).toBeGreaterThan(0);
    const split = t.meta.junctions!.find((j) => j.kind === 'split' && j.branch === cut)!;
    expect(split.gore).toBeDefined();
    const g = split.gore!;
    const n = t.sphereWalls(g.x + g.fx * 0.7, g.y + 0.6, g.z + g.fz * 0.7, 0.9, cs, 8);
    expect(n).toBeGreaterThan(0);
    expect(cs.slice(0, n).some((c) => (c.flags & TFLAG.SOFT) !== 0)).toBe(true);
    // the host's branch-side wall is open between the branch's crossing points
    const b = t.path(cut);
    t.frameAt(0, b.hostFrom! + 24, f); // the branch has crossed the host edge but not yet left it
    const side = -1; // the branch leaves to the left
    const q = side * (f.wL - 0.2);
    expect(t.sphereWalls(f.px + f.rx * q + f.ux * 0.6, f.py + f.ry * q + f.uy * 0.6, f.pz + f.rz * q + f.uz * 0.6, 0.85, cs, 8)).toBe(0);
  });

  it('locate follows a kart from the host into the branch and back with continuous progress', () => {
    const b = t.path(cut), f = frame();
    const pts: { x: number; y: number; z: number }[] = [];
    for (let s = b.hostFrom! - 30; s < b.hostFrom!; s += 0.5) { t.frameAt(0, s, f); pts.push({ x: f.px, y: f.py, z: f.pz }); }
    for (let s = 0; s <= b.length; s += 0.5) { t.frameAt(cut, s, f); pts.push({ x: f.px, y: f.py, z: f.pz }); }
    for (let s = b.hostTo!; s < b.hostTo! + 30; s += 0.5) { t.frameAt(0, s, f); pts.push({ x: f.px, y: f.py, z: f.pz }); }
    const start: TrackLoc = { path: 0, i: Math.floor((b.hostFrom! - 30) / t.path(0).ds), s: b.hostFrom! - 30, u: 0, h: 0, sMain: b.hostFrom! - 30, valid: 1 };
    const w = locateWalk(t, pts, start);
    expect(w.ok).toBe(true);
    expect(w.paths.includes(cut)).toBe(true);
    expect(w.paths[w.paths.length - 1]).toBe(0);
    expect(w.maxJump).toBeLessThan(6); // the affine map differs from the host parameterisation where the paths overlap
    for (let i = 1; i < w.sMain.length; i++) expect(w.sMain[i]! - w.sMain[i - 1]!).toBeGreaterThan(-0.01);
    expect(t.toMainS(cut, 0)).toBeCloseTo(b.map!.fromS, 6);
    expect(t.toMainS(cut, b.length)).toBeCloseTo(b.map!.toS, 6);
  });

  it('pads, zones, sub-surfaces and shoulders land on the ground triangles', () => {
    const boost = t.pads.filter((p) => p.kind === 'boost' && p.path === 0);
    expect(boost.length).toBe(2);
    for (const p of boost) expect(surfaceAt(t, 0, (p.s0 + p.s1) / 2, 0)).toBe(surfCode('boost_pad'));
    const jp = t.pads.find((p) => p.kind === 'jump')!;
    expect(surfaceAt(t, 0, (jp.s0 + jp.s1) / 2, 0)).toBe(surfCode('jump_pad'));
    const bp = t.pads.find((p) => p.path === cut)!;
    expect(surfaceAt(t, cut, (bp.s0 + bp.s1) / 2, 0)).toBe(surfCode('boost_pad'));
    expect(surfaceAt(t, cut, 60, 0)).toBe(surfCode('dirt'));
    const conv = t.zones.filter((z) => z.kind === 'conveyor');
    expect(conv.map((z) => z.speedMul).sort()).toEqual([0.85, 1.15]);
    const fwd = conv.find((z) => z.speedMul === 1.15)!;
    expect(surfaceAt(t, 0, (fwd.s0 + fwd.s1) / 2, 4)).toBe(surfCode('conveyor_fwd'));
    expect(surfaceAt(t, 0, (fwd.s0 + fwd.s1) / 2, -4)).toBe(surfCode('conveyor_back'));
    const sand = t.zones.find((z) => z.kind === 'surface')!;
    expect(surfaceAt(t, 0, (sand.s0 + sand.s1) / 2, -5.5)).toBe(surfCode('sand'));
    expect(surfaceAt(t, 0, (sand.s0 + sand.s1) / 2, 3)).toBe(surfCode("cobble")); // surf persists from the far straight
    // far straight is cobble, west straight has sand shoulders
    const far = r.model.toMain(r.model.paths[0]!.labels.get('far')!) + 60;
    expect(surfaceAt(t, 0, far, 0)).toBe(surfCode('cobble'));
    const west = r.model.toMain(r.model.paths[0]!.labels.get('west')!) + 100;
    expect(surfaceAt(t, 0, west, 9.5)).toBe(surfCode('sand'));
    expect(surfaceAt(t, 0, 300, 9)).toBe(surfCode('grass'));
  });

  it('noItem zones set the sample flag; key gates avoid the branch span', () => {
    const z = t.zones.find((q) => q.kind === 'noItem')!;
    expect(t.flagsAt!(0, (z.s0 + z.s1) / 2) & SFLAG.NO_ITEM).toBeTruthy();
    expect(t.flagsAt!(0, z.s1 + 30) & SFLAG.NO_ITEM).toBeFalsy();
    const b = t.path(cut);
    for (const k of t.keyGates) expect(k > b.hostFrom! - 3 && k < b.hostTo! + 3).toBe(false);
    expect(t.keyGates.length).toBeGreaterThanOrEqual(6);
  });

  it('PROPS rows never land on a road surface', () => {
    const h = hit();
    const rows = r.visMeta.props.filter((p) => p.kind === 'cone' || p.kind === 'bush');
    expect(rows.length).toBe(2);
    const vis = readContainer(toArrayBuffer(r.vis), CVIS_MAGIC, CVIS_VERSION);
    r.visMeta.props.forEach((p, j) => {
      if (p.kind !== 'cone' && p.kind !== 'bush') return;
      const xf = vis.arrays.get(`p${j}.xf`)!;
      for (let i = 0; i < p.n; i++) expect(t.groundRay(xf[i * 6]!, xf[i * 6 + 1]! + 1.5, xf[i * 6 + 2]!, 0, -1, 0, 3, h)).toBe(false);
    });
  });

  it('bakes byte-identically twice', () => {
    const file = TRACKS + '_test/f1_branch.ctd';
    const again = buildTrack(readFileSync(file, 'utf8'), file);
    expect(Buffer.compare(Buffer.from(again.ctrk), Buffer.from(r.ctrk))).toBe(0);
    expect(Buffer.compare(Buffer.from(again.vis), Buffer.from(r.vis))).toBe(0);
  });
});
