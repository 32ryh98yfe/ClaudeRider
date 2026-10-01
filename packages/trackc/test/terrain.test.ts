// Terrain beside a road follows that road (L5-terrain-elevation): no trench along raised sections, props stay, but
// open kill ledges and jump gaps still fall away.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CVIS_MAGIC, CVIS_VERSION, readContainer, toArrayBuffer } from '@cr/sim';
import { TRACKS } from './helpers.ts';
import { buildTrack } from '../src/build.ts';
import { sampleAt } from '../src/paths.ts';
import { buildTerrainField } from '../src/terrain.ts';

const RAISED = `TRACK raised name="Raised" theme=clayhill_village diff=1 laps=3 topo=circuit
DEFAULTS w=16 surf=asphalt wall=fence:1.0 blend=16
START pos=(0,0,0) hdg=0
S ?a @home
C R40 90 L
S 100 dy=+10
S 160 @high
S 100 dy=-10
C R40 90 L
S ?a
C R40 90 L
S 360
C R40 90 L
CLOSE solve=[?a] length=1500
PROPS kind=pine along=main side=both every=20 offset=3
`;

describe('terrain next to roads', () => {
  it('a road 10 m above the track low point has ground at road level beside it, not a trench', () => {
    const r = buildTrack(RAISED, 'raised.ctd', { props: false });
    const tf = buildTerrainField(r.model, r.content, r.meta.bounds, () => 0, 0);
    const main = r.model.paths[0]!;
    const s0 = r.model.toMain(main.prims.find((q) => q.line === 7)!.s0); // S 160 @high (level, +10 m)
    for (let s = s0 + 20; s < s0 + 140; s += 20) {
      const q = sampleAt(main, s);
      for (const side of [-1, 1]) {
        const d = side * (q.w / 2 + 1.5);
        const h = tf.height(q.x + q.rx * d, q.z + q.rz * d);
        expect(h, `s=${s} side ${side}`).toBeGreaterThan(q.y - 1);
        expect(h).toBeLessThan(q.y);
      }
    }
  });

  it('roadside prop rows on the raised section are placed', () => {
    const r = buildTrack(RAISED, 'raised.ctd');
    const c = readContainer(toArrayBuffer(r.vis), CVIS_MAGIC, CVIS_VERSION);
    const j = (c.meta as { props: { kind: string }[] }).props.findIndex((p) => p.kind === 'pine');
    expect(j).toBeGreaterThanOrEqual(0);
    const xf = c.arrays.get(`p${j}.xf`) as Float32Array;
    const high = [];
    for (let i = 0; i < xf.length; i += 6) if (xf[i + 1]! > 8) high.push(i);
    expect(high.length).toBeGreaterThan(10); // 160 m level + ramps, both sides, every 20 m
  });

  it('an open kill ledge still falls away beside the road', () => {
    const src = readFileSync(TRACKS + '_test/f2_jumps.ctd', 'utf8');
    const r = buildTrack(src, 'f2.ctd', { props: false });
    const tf = buildTerrainField(r.model, r.content, r.meta.bounds, () => 0, 0);
    const main = r.model.paths[0]!;
    const q0 = main.prims.find((q) => q.line === 14)!; // S ?a wallR=none … kill=lava @ledge
    const s = r.model.toMain(q0.s0) + q0.len / 2, q = sampleAt(main, s);
    const d = q.w / 2 + 1.5;
    expect(tf.height(q.x + q.rx * d, q.z + q.rz * d)).toBeLessThan(q.y - 3);
  });
});

describe('props on elevated decks (L6 §1)', () => {
  it('deck-edge rows stand on the deck edge where the ground is far below; farther rows stand on the ground', () => {
    const src = readFileSync(TRACKS + '_test/f6_helix.ctd', 'utf8') + 'PROPS kind=lamp along=main side=both every=20 offset=0.5\nPROPS kind=billboard along=main side=R every=60 offset=6\n';
    const r = buildTrack(src, 'f6p.ctd');
    expect(r.stats.propsDroppedFloating).toBeLessThanOrEqual(2); // only far-out rows over a lower road or a chasm
    const tf = buildTerrainField(r.model, r.content, r.meta.bounds, () => 0, 0);
    const c = readContainer(toArrayBuffer(r.vis), CVIS_MAGIC, CVIS_VERSION);
    const kinds = (c.meta as { props: { kind: string }[] }).props;
    const lamps = c.arrays.get(`p${kinds.findIndex((p) => p.kind === 'lamp')}.xf`) as Float32Array;
    const rows = Math.floor(r.model.paths[0]!.length / 20) * 2;
    expect(lamps.length / 6).toBeGreaterThan(rows * 0.6); // exclusions (line, pads, items) take the rest
    // on the stacked helix some lamps stand on an upper deck, well above the ground under them
    let onDeck = 0;
    for (let i = 0; i < lamps.length; i += 6) if (lamps[i + 1]! - tf.height(lamps[i]!, lamps[i + 2]!) > 5) onDeck++;
    expect(onDeck).toBeGreaterThan(3);
  });
});
