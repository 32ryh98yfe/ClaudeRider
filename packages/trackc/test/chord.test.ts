// L6 §8: a risk BRANCH laid as the chord of a symmetric host WIGGLE never really leaves the host road; its J ramp
// and landing overlap the host with 0.2–1 m steps. V18 now names it, overlapping-surface samples are no respawn slot,
// and a branch sample without a slot of its own respawns on the host (it used to respawn in place, in a loop).
import { describe, expect, it } from 'vitest';
import { CTRK_MAGIC, CTRK_VERSION, SMP, readContainer, toArrayBuffer } from '@cr/sim';
import { bakeSrc, reload } from './helpers.ts';

const CHORD = `TRACK chord name="Chord" theme=spark_circuit diff=3 laps=3 topo=circuit
DEFAULTS w=12 surf=asphalt wall=barrier:1.0 blend=18
START pos=(0,0,0) hdg=0
S 100 @home
C R40 90 L
S 150
WIGGLE R30 40/80/40 L @wig
S 150
C R40 90 L
S ?a
C R40 90 L
S ?b
C R40 90 L
CLOSE solve=[?a,?b]
BRANCH gap from=@wig to=@wig+83.78 kind=risk aiMin=0.8 w=8 wall=barrier:1.0 {
  S 17 ; J ramp=8@10 gap=10 drop=1 land=42 wland=10 vmin=24 vmax=46 ; S 0.13
}
`;

describe('branch laid as the chord of a host wiggle', () => {
  const r = bakeSrc(CHORD);
  const t = reload(r);
  const b = r.model.paths.find((p) => p.id === 'gap')!;
  const c = readContainer(toArrayBuffer(r.ctrk), CTRK_MAGIC, CTRK_VERSION);
  const rok = c.arrays.get(`p${b.index}.rok`) as Uint8Array, rto = c.arrays.get(`p${b.index}.rto`) as Int32Array;
  const smp = c.arrays.get(`p${b.index}.smp`)!;

  it('V18 names the overlap and its height step', () => {
    const v = r.findings.filter((f) => f.rule === 'V18');
    expect(v).toEqual([expect.objectContaining({ severity: 'error', msg: expect.stringMatching(/branch gap: overlaps its host road with a 0\.\d+ m height step/) })]);
  });

  it('no respawn slot where the branch sits on the host at a different height, and no branch sample respawns in place', () => {
    for (let i = 0; i < rok.length; i++) {
      const s = smp[i * SMP.STRIDE + SMP.S]!;
      if (s > 4 && s < 17) expect(rok[i], `s=${s}`).toBe(0); // the ramp run-in overlapping the lower host road
      expect(rto[i], `s=${s}`).not.toBe(-1);
    }
  });

  it('a host-fallback target decodes to a pose on the host road', () => {
    const i = [...rto].findIndex((v) => v <= -2);
    expect(i).toBeGreaterThanOrEqual(0);
    const loc = { path: b.index, i, s: smp[i * SMP.STRIDE + SMP.S]!, u: 0, h: 0, sMain: 0, valid: 1 };
    const out = { ...loc };
    t.respawnLoc!(loc, out);
    expect(out.path).toBe(0);
    const pose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
    t.respawnPose(loc, pose);
    const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
    t.frameAt(0, out.s, f);
    expect(Math.hypot(pose.x - f.px, pose.z - f.pz)).toBeLessThan(1e-6);
  });
});
