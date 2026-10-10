import { describe, expect, it } from 'vitest';
import { CTRK_MAGIC, CTRK_VERSION, CVIS_MAGIC, CVIS_VERSION, readContainer, toArrayBuffer } from '@cr/sim';
import { bake, bakeSrc, contacts } from './helpers.ts';

const SOURCE = `TRACK props_test name="Props" theme=clayhill_village diff=1 laps=1 topo=circuit
DEFAULTS w=16 surf=asphalt wall=barrier:1.2
START pos=(0,0,0) hdg=0
S 150
C R30 180 L
S 150
C R30 180 L
LINE start at=0
THEME scatter=none hills=0
PROP kind=gantry at=(1000,0,1000)
PROP kind=gantry at=(1050,0,1000)
PROP kind=gantry at=(1100,0,1000)
`;

describe('shared instanced prop collision bake', () => {
  it('publishes bit-identical final instance transforms and geometry indices in both files', () => {
    const r = bakeSrc(SOURCE, { props: true });
    const physics = readContainer(toArrayBuffer(r.ctrk), CTRK_MAGIC, CTRK_VERSION), visual = readContainer(toArrayBuffer(r.vis), CVIS_MAGIC, CVIS_VERSION);
    expect(r.meta.propContacts?.version).toBe(2); expect(r.visMeta.propContactVersion).toBe(2);
    for (let j = 0; j < r.visMeta.props.length; j++) for (const name of ['mat', 'geo', 'flags', 'contacts', 'support']) {
      const a = physics.arrays.get(`prop${j}.${name}`)!, b = visual.arrays.get(`p${j}.${name}`)!;
      expect(Array.from(a), `${j}/${name}`).toEqual(Array.from(b));
    }
  });

  it('shares original local geometry and retains hard bodies far outside the normal road envelope', () => {
    const r = bakeSrc(SOURCE, { props: true });
    const c = readContainer(toArrayBuffer(r.ctrk), CTRK_MAGIC, CTRK_VERSION), j = r.meta.propContacts!.sets.findIndex(p => p.kind === 'gantry');
    const ids = c.arrays.get(`prop${j}.geo`) as Uint32Array, flags = c.arrays.get(`prop${j}.flags`) as Uint8Array;
    expect(ids.length).toBe(4);
    expect([...ids.slice(1)]).toEqual([ids[1], ids[1], ids[1]]);
    expect(flags.every(x => x !== 0)).toBe(true);
    // The distant structures lie beyond the static wall hash. Their actual posts still collide through sphereWalls.
    expect(r.track.sphereWalls(1000 - 9.4, 0.6, 1000, 0.85, contacts(), 8)).toBeGreaterThan(0);
    // The opening stays physically clear; no enclosing bounding box becomes a road-wide blocker.
    expect(r.track.sphereWalls(1000, 0.6, 1000, 0.85, contacts(), 8)).toBe(0);
  });

  it('every instance has stable virtual triangle ranges matching its actual local geometry', () => {
    const r = bake('lantern_hollow/manor_catacombs.ctd');
    const c = readContainer(toArrayBuffer(r.ctrk), CTRK_MAGIC, CTRK_VERSION);
    let first = (c.arrays.get('w.idx') as Uint32Array).length / 3;
    const meta = r.meta.propContacts!;
    for (let j = 0; j < meta.sets.length; j++) {
      const geo = c.arrays.get(`prop${j}.geo`) as Uint32Array, ranges = c.arrays.get(`prop${j}.contacts`) as Uint32Array;
      for (let i = 0; i < geo.length; i++) {
        const triangles = geo[i] === 0xffffffff ? 0 : (c.arrays.get(`${meta.geometries[geo[i]!]!.prefix}.idx`) as Uint32Array).length / 3;
        expect(ranges[i * 2]).toBe(first); expect(ranges[i * 2 + 1]).toBe(triangles); first += triangles;
      }
    }
    expect(r.stats.propContactUniqueTriangles).toBeLessThan(r.stats.propContactTriangles! * 0.3);
  });
});
