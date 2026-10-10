import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { DEFAULT_PROPS, type PropFactory } from '../src/render/props/defaults.ts';
import { TRACKSIDE_PROPS } from '../src/render/props/trackside.ts';
import { CANOPY_PROPS } from '../src/render/themes/canopy_forest/props.ts';
import { CLAYHILL_PROPS } from '../src/render/themes/clayhill_village/props.ts';
import { CORAL_PROPS } from '../src/render/themes/coral_cove/props.ts';
import { FROSTBYTE_PROPS } from '../src/render/themes/frostbyte_glacier/props.ts';
import { LANTERN_PROPS } from '../src/render/themes/lantern_hollow/props.ts';
import { NEON_PROPS } from '../src/render/themes/neon_harbor/props.ts';
import { ORBITAL_PROPS } from '../src/render/themes/orbital_nexus/props.ts';
import { SPARK_PROPS } from '../src/render/themes/spark_circuit/props.ts';
import { SUNSTONE_PROPS } from '../src/render/themes/sunstone_desert/props.ts';
import type { ContactRange } from '../src/render/util/geo.ts';

const palette = ['#d97757','#f4efe6','#6fae4b','#9fd3f5'];
function geometry(props: Record<string, PropFactory>, kind: string): BufferGeometry { return props[kind]!.build(palette).geometry; }
function counts(g: BufferGeometry): Record<string, number> {
  const ranges = g.userData['contactRanges'] as ContactRange[];
  expect(ranges.reduce((n,r) => n + r.count, 0)).toBe(g.getAttribute('position').count);
  const counts: Record<string, number> = { solid: 0, cosmetic: 0, support: 0 };
  for (const range of ranges) counts[range.role]! += range.count;
  return counts;
}

describe('physical prop parts', () => {
  it('keeps actual trunks and posts while excluding broad foliage and hanging cloth', () => {
    const cases: [Record<string, PropFactory>, string][] = [
      [DEFAULT_PROPS,'tree_round'],[DEFAULT_PROPS,'tree_pine'],[TRACKSIDE_PROPS,'tree_round_big'],[TRACKSIDE_PROPS,'tree_clump'],[TRACKSIDE_PROPS,'flag_pole'],
      [CANOPY_PROPS,'giant_trunk'],[CANOPY_PROPS,'old_oak'],[CANOPY_PROPS,'forest_wall'],[CANOPY_PROPS,'bamboo'],[CANOPY_PROPS,'rope_rail'],
      [CLAYHILL_PROPS,'cypress'],[CLAYHILL_PROPS,'orchard_tree'],[CLAYHILL_PROPS,'bunting'],[CLAYHILL_PROPS,'flower_box'],
      [CORAL_PROPS,'palm'],[CORAL_PROPS,'galleon'],[FROSTBYTE_PROPS,'pine_snow'],[FROSTBYTE_PROPS,'birch'],[FROSTBYTE_PROPS,'tree_round_big'],
      [LANTERN_PROPS,'crooked_tree'],[NEON_PROPS,'street_tree'],[NEON_PROPS,'flag_pole'],[ORBITAL_PROPS,'flag_pole'],
      [SPARK_PROPS,'tree_round'],[SPARK_PROPS,'pine'],[SUNSTONE_PROPS,'palm'],[SUNSTONE_PROPS,'tree_round_big'],[SUNSTONE_PROPS,'tree_clump'],[SUNSTONE_PROPS,'street_bunting'],
    ];
    for (const [props, kind] of cases) {
      const g = geometry(props,kind), c = counts(g);
      expect(c['solid'], `${kind}: structural body`).toBeGreaterThan(0);
      expect(c['cosmetic'], `${kind}: soft decoration`).toBeGreaterThan(0);
      g.dispose();
    }
  });

  it('the default round tree contact ends at the visible trunk, not the canopy outline', () => {
    const g = geometry(DEFAULT_PROPS,'tree_round'), p = g.getAttribute('position');
    let maxY = -Infinity, maxX = -Infinity;
    for (const r of g.userData['contactRanges'] as ContactRange[]) if (r.role === 'solid') for (let i=r.start;i<r.start+r.count;i++) { maxY=Math.max(maxY,p.getY(i));maxX=Math.max(maxX,Math.abs(p.getX(i))); }
    expect(maxY).toBeCloseTo(2.4,5);expect(maxX).toBeLessThan(0.36);
    g.computeBoundingBox(); expect(g.boundingBox!.max.y).toBeGreaterThan(5);
  });

  it('retains pond stones and the waterfall backing while making water nonblocking', () => {
    for (const [props,kind] of [[CANOPY_PROPS,'pond'],[CANOPY_PROPS,'waterfall'],[CLAYHILL_PROPS,'creek'],[LANTERN_PROPS,'creek']] as const) {
      const c = counts(geometry(props,kind)); expect(c['solid']).toBeGreaterThan(0);expect(c['cosmetic']).toBeGreaterThan(0);
    }
  });

  it('keeps rigid advertising boards solid even when their asset kind is called banner', () => {
    expect(counts(geometry(SPARK_PROPS,'banner'))['cosmetic']).toBe(0);
  });

  it('does not invent trunks for a far snow-pine canopy-only cluster', () => {
    const c = counts(geometry(FROSTBYTE_PROPS,'tree_clump'));
    expect(c['solid']).toBe(0); expect(c['cosmetic']).toBeGreaterThan(0);
  });
});
