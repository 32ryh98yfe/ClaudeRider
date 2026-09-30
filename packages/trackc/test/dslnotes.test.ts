// L12-dsl-notes: `none::ledgeKill` wall specs, PROPS ranges that wrap past the line, props on the high side of banks.
import { describe, expect, it } from 'vitest';
import { CVIS_MAGIC, CVIS_VERSION, readContainer, toArrayBuffer } from '@cr/sim';
import { buildTrack, type BuildResult } from '../src/build.ts';
import { parseWall } from '../src/turtle.ts';

const RING = (extra: string, corner = 'C R50 180 L'): string => `TRACK notes name="Notes" theme=clayhill_village diff=2 laps=3 topo=circuit
DEFAULTS w=16 surf=asphalt wall=fence:1.0 blend=16
START pos=(0,0,0) hdg=0
S ?a @home
${corner} @t1
S ?a @back
C R50 180 L @t2
CLOSE solve=[?a] length=1200
${extra}
`;

function propsOf(r: BuildResult, kind: string): Float32Array {
  const c = readContainer(toArrayBuffer(r.vis), CVIS_MAGIC, CVIS_VERSION);
  const j = (c.meta as { props: { kind: string }[] }).props.findIndex((p) => p.kind === kind);
  return j < 0 ? new Float32Array(0) : (c.arrays.get(`p${j}.xf`) as Float32Array);
}

describe('L12 DSL notes', () => {
  it('accepts the cookbook form `none::ledgeKill` (empty height = the type default) as well as `none:0:ledgeKill`', () => {
    const a = parseWall('none::ledgeKill', parseWall('fence:1.0', undefined as never, 'x', 1), 'x', 1);
    expect(a.type).toBe('none');
    expect(a.ledgeKill).toBe(true);
    const b = parseWall('none:0:ledgeKill', a, 'x', 1);
    expect(b.ledgeKill).toBe(true);
    expect(() => buildTrack(RING('').replace('S ?a @back', 'S ?a @back wallR=none::ledgeKill'), 'n.ctd', { props: false, terrain: false })).not.toThrow();
  });

  it('a PROPS range that wraps past the start line places a full row', () => {
    const r = buildTrack(RING('PROPS kind=pine along=main side=R every=10 offset=4 from=@t2+100 to=@home+150'), 'n.ctd', { terrain: false });
    const xf = propsOf(r, 'pine');
    // t2 is 157 m long: ~57 m before the line + 150 m after it, one prop every 10 m
    expect(xf.length / 6).toBeGreaterThan(15);
    const xs = new Set<number>();
    for (let i = 0; i < xf.length; i += 6) xs.add(Math.round(xf[i]! / 5));
    expect(xs.size).toBeGreaterThan(10); // spread along the range, not stacked on one sample
  });

  it('props on the high side of a banked corner are kept', () => {
    const r = buildTrack(RING('PROPS kind=pine along=main side=R every=10 offset=20 from=@t1 to=@t1+150', 'C R50 180 L bank=8'), 'n.ctd');
    // the corner turns left, so its outside (high side of the bank) is the right side
    expect(propsOf(r, 'pine').length / 6).toBeGreaterThan(10);
  });
});
