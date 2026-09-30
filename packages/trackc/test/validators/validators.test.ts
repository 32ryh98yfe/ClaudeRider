// One seeded violation per validator (11-track-spec §9: the L4 done criterion). Each case edits a clean source
// (meadow_loop is strict-clean via its @signature; the F-fixtures cover their features) so exactly that rule fires.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKS, bakeSrc } from '../helpers.ts';
import type { BuildOptions } from '../../src/build.ts';
import { validate } from '../../src/validate.ts';

const src = (rel: string): string => readFileSync(TRACKS + rel, 'utf8');
const MEADOW = src('clayhill_village/meadow_loop.ctd');
const F1 = src('_test/f1_branch.ctd'), F3 = src('_test/f3_halfpipe.ctd'), F4 = src('_test/f4_rails.ctd'), F5 = src('_test/f5_hazards.ctd'), F6 = src('_test/f6_helix.ctd');

/** Replaces `from` (must occur) with `to`. */
function edit(s: string, from: string, to: string): string {
  if (!s.includes(from)) throw new Error(`seed edit: "${from}" not found`);
  return s.replace(from, to);
}
function findings(s: string, rule: string, opts: BuildOptions = {}): { severity: string; msg: string }[] {
  return bakeSrc(s, opts).findings.filter((f) => f.rule === rule);
}
const errors = (s: string, rule: string, opts: BuildOptions = {}): string[] => findings(s, rule, opts).filter((f) => f.severity === 'error').map((f) => f.msg);

describe('the clean bases', () => {
  it('meadow_loop is strict-clean (0 errors of any rule)', () => {
    expect(bakeSrc(MEADOW).findings.filter((f) => f.severity === 'error')).toEqual([]);
  });
});

describe('seeded violations', () => {
  it('V0 signature feature missing', () => {
    expect(errors(edit(MEADOW, '@signature pads, surfaces, jump', '@signature pads, surfaces, jump, rail'), 'V0')).toEqual([expect.stringMatching(/rail/)]);
  });
  it('V1 elevation does not close', () => {
    expect(errors(edit(MEADOW, 'S 71                                      @windmill_run', 'S 71 dy=1 @windmill_run'), 'V1')).toEqual([expect.stringMatching(/elevation does not close/)]);
  });
  it('V2 stacked decks too close', () => {
    expect(errors(edit(edit(F6, 'HELIX R30 540 L dy=-16', 'HELIX R30 540 L dy=-11'), 'S ?c dy=+17', 'S ?c dy=+12'), 'V2').length).toBeGreaterThan(0);
  });
  it('V3 radius below the D1 minimum', () => {
    expect(errors(edit(MEADOW, 'C R40 110 L bank=6', 'C R26 110 L bank=6'), 'V3')).toEqual([expect.stringMatching(/radius 26\.0 m below the D1 minimum 30/)]);
  });
  it('V4 attribute blend below 15 m', () => {
    expect(errors(edit(MEADOW, 'blend=16', 'blend=10'), 'V4')).toContainEqual(expect.stringMatching(/blends must be ≥ 15 m/));
  });
  it('V5 sustained grade (strict)', () => {
    const s = edit(edit(MEADOW, 'S ?b=56 dy=2 ', 'S ?b=56 dy=8 '), 'S ?c=118 dy=-1.5', 'S ?c=118 dy=-7.5');
    expect(errors(s, 'V5').length).toBeGreaterThan(0);
  });
  it('V5 is only a warning without @signature / --strict', () => {
    const s = edit(edit(edit(MEADOW, '@signature pads, surfaces, jump\n', ''), 'S ?b=56 dy=2 ', 'S ?b=56 dy=8 '), 'S ?c=118 dy=-1.5', 'S ?c=118 dy=-7.5');
    const f = findings(s, 'V5');
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.severity === 'warn')).toBe(true);
    expect(findings(s, 'V5', { strict: true }).some((x) => x.severity === 'error')).toBe(true);
  });
  it('V6 bank rate', () => {
    expect(errors(edit(MEADOW, 'C R40 175 L bank=7', 'C R40 175 L bank=35'), 'V6')).toContainEqual(expect.stringMatching(/bank rate/));
  });
  it('V7 worldUp frame on a loop', () => {
    expect(errors(edit(F6, 'LOOP R12 shift=18 ease=15', 'LOOP R12 shift=18 ease=15 frame=worldUp'), 'V7')).toEqual([expect.stringMatching(/frame=worldUp/)]);
  });
  it('V8 too few key gates', () => {
    expect(errors(edit(MEADOW, 'KEYS 240,460,660,860,1070,1280', 'KEYS 240,460'), 'V8')).toEqual([expect.stringMatching(/only 2 key gates/)]);
  });
  it('V9 item rows too close together', () => {
    expect(errors(edit(MEADOW, 'ITEMS at=160,320,', 'ITEMS at=160,200,'), 'V9')).toContainEqual(expect.stringMatching(/item rows only 40 m apart/));
  });
  it('V10 boost pad in a jump landing zone (and a pad count outside 2–4 is a warning)', () => {
    expect(errors(edit(MEADOW, 'PAD at=55,105 d=0 len=6 w=4', 'PAD at=55,105,@bridge+24 d=0 len=6 w=4'), 'V10')).toContainEqual(expect.stringMatching(/boost pad in a jump landing zone/));
    expect(findings(edit(MEADOW, 'PAD at=55,105 d=0 len=6 w=4', 'PAD at=55 d=0 len=6 w=4'), 'V10')).toEqual([expect.objectContaining({ severity: 'warn', msg: expect.stringMatching(/1 boost pads per lap/) })]);
  });
  it('V11 slow edge of the speed window falls short of the landing', () => {
    expect(errors(edit(MEADOW, 'vmin=25 vmax=46', 'vmin=12 vmax=46'), 'V11')).toContainEqual(expect.stringMatching(/at 12 m\/s/));
  });
  it('V12 hazard next to an item row', () => {
    expect(errors(MEADOW + 'HAZ geyser at=165 d=0 r=3 period=3.6 on=0-1 tele=0.8 offset=0\n', 'V12')).toEqual([expect.stringMatching(/within ±15 m of an item row/)]);
  });
  it('V13 laps do not match the reference lap', () => {
    expect(errors(MEADOW, 'V13', { refLapTicks: 60 * 20 })).toContainEqual(expect.stringMatching(/laps=3 but the ghost lap 20\.0 s/));
    expect(errors(MEADOW, 'V13', { refLapTicks: 60 * 38 })).toEqual([]);
  });
  it('V14 straight ratio outside the band (strict)', () => {
    expect(errors(edit(MEADOW, 'length=1400', 'length=2200'), 'V14')).toEqual([expect.stringMatching(/straight ratio/)]);
  });
  it('V15 samples with no ground outside a jump/warp span', () => {
    const s = edit(edit(F3, 'DEFAULTS', 'PROFILE pit custom pts=[-9:0,-6:0,-1:-3,1:-3,6:0,9:0]\nDEFAULTS'), 'S ?a', 'S ?a prof=pit');
    expect(errors(s, 'V15')).toContainEqual(expect.stringMatching(/samples have no ground/));
  });
  it('V16 plaza guide leaves its area', () => {
    expect(errors(edit(F3, 'rIn=18 rOut=48', 'rIn=18 rOut=30'), 'V16')).toContainEqual(expect.stringMatching(/guide path leaves the area/));
  });
  it('V17 rail lock time too long', () => {
    expect(errors(edit(F4, 'speed=(min 38, accel 3, max 42)', 'speed=(min 8, accel 1, max 9)'), 'V17')).toContainEqual(expect.stringMatching(/lock time/));
  });
  it('V18 branch aiMin outside [0, 1]', () => {
    expect(errors(edit(F1, 'aiMin=0.3', 'aiMin=1.5'), 'V18')).toEqual([expect.stringMatching(/aiMin 1\.5 outside \[0, 1\]/)]);
  });
  it('V19 too few drift corners: an error on ghost data, a warning on the analytic estimate', () => {
    const r = bakeSrc(F5, { strict: true });
    expect(r.findings.filter((f) => f.rule === 'V19')).toEqual([expect.objectContaining({ severity: 'warn', msg: expect.stringMatching(/0 corners .*analytic envelope estimate/) })]);
    const g = validate(r, { strict: true, ghost: { refLapTicks: 0, corners: [{ s: 300, driftGain: 0.2 }, { s: 900, driftGain: 0.05 }] } }).filter((f) => f.rule === 'V19');
    expect(g).toEqual([expect.objectContaining({ severity: 'error', msg: expect.stringMatching(/^1 corners .*\(ghost\); D3 needs 5/) })]);
  });
  it('V20 too many draw groups in one chunk', () => {
    // nine 8 m surface strips in one chunk: nine road slots plus walls and kerbs
    const surfs = ['dirt', 'ice', 'sand', 'snow', 'gravel', 'cobble', 'wood', 'metal', 'stone'];
    const strip = surfs.map((sf) => `S 8 surf=${sf}`).join(' ; ');
    expect(errors(edit(MEADOW, 'S 72 wall=fence:1.0:soft                 @hay_straight', `${strip} @hay_straight`), 'V20')).toContainEqual(expect.stringMatching(/draw groups/));
  });
});
