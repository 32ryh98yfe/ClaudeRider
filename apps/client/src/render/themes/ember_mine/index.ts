// Ember Mine — an underground quarry lit by amber lanterns, cyan/violet geodes and lava. Roads are cool grey basalt
// (so the coral mascots pop against them) with amber edge paint; the hemisphere mixes crystal-violet light from
// above with a lava bounce from below. The night-sky shader stands in for the cave roof.
import type { ContentTables } from '@cr/content';
import { MaterialLibrary } from '../../materials/library.ts';
import { makeKit, type ThemeKit } from '../kit.ts';
import { EMBER_PROPS } from './props.ts';
import { EMBER_DRESSING } from './dressing.ts';

export default (c: ContentTables): ThemeKit => {
  const kit = makeKit(c.themes.get('ember_mine'), {
    road: { style: 'dirt', a: '#56515c', b: '#645e6a', line: '#ffb347' },
    shoulder: { a: '#554c54', b: '#63575e' },
    terrain: { a: '#50464e', b: '#625459', rock: '#3d353b' },
    wall: { kind: 'stone', a: '#4a434e', b: '#665552' },
    kerb: ['#e8622a', '#2a232c'],
    sky: { turbidity: 1, rayleigh: 0.5, elevationDeg: 70, azimuthDeg: 200, exposure: 0.8, night: true, top: '#050408', bottom: '#241018' },
    sun: { color: '#ffd2a0', intensity: 1.25 },
    // stylized pass (2026-10): the cave stays a cave, but the crystal-violet sky fill and lava bounce are stronger and
    // a shadowless amber back fill (the work lamps) keeps the karts' shaded sides in colour; shadows stay soft, rims
    // a little lower so bodies do not wash out, and bloom is held to the lamps, crystals and lava
    // review round: the infield and far corners read ~85% black on Magma, so the sky fill is up (1.4 → 1.7) and the cave
    // floor is ~15% lighter; the vault's horizon lava band is cut to 0.07 so the lava props, not the sky, carry the glow
    hemi: { sky: '#9aa6e8', ground: '#c4734a', intensity: 1.7 },
    caveGlow: 0.07,
    fill: { color: '#ffb985', intensity: 0.3 },
    shadowStrength: 0.6,
    exposure: 1.28,
    envIntensity: 0.25,
    rimBoost: 1.6,
    bloom: 0.38,
    fogColor: '#22171f',
    grade: { saturation: 1.04, tint: '#ffffff', shadows: '#e8e4ff', highlights: '#fff2e2' },
  }, { ...EMBER_PROPS, ...EMBER_DRESSING });
  // elevated ribbons get skirts down to the terrain: make them read as basalt embankments, not grey concrete
  const base = kit.materials;
  // stylized pass: the neutral basalt / obsidian surface looks and the rock walls read near-black under the cave light,
  // so the kit gives them mid-value basalt (cool grey road, warmer wall) with the amber edge paint; tints divide out
  // the .vis per-surface tint (TrackView SURFACE_TINT / WALL_TINT)
  kit.materials = () => ({
    ...base(),
    underside: MaterialLibrary.world({ color: '#2f2830', color2: '#40353a', roughness: 0.92, noiseScale: 0.35, vertexAO: true }),
    'road:basalt': MaterialLibrary.road({ style: 'basalt', a: '#5f585d', b: '#6f686c', line: '#ffb347', tint: [0.7, 0.68, 0.7] }),
    'road:obsidian': MaterialLibrary.road({ style: 'obsidian', a: '#3e344c', b: '#4d425e', line: '#ffb347', tint: [0.55, 0.5, 0.65] }),
    'wall:rock': MaterialLibrary.wall('rock', '#5b4f52', '#7a6a62', 0.8),
  });
  return kit;
};
