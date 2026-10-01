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
    shoulder: { a: '#433c46', b: '#4e4650' },
    terrain: { a: '#38323a', b: '#463d42', rock: '#2a252b' },
    wall: { kind: 'stone', a: '#4a434e', b: '#665552' },
    kerb: ['#e8622a', '#2a232c'],
    sky: { turbidity: 1, rayleigh: 0.5, elevationDeg: 70, azimuthDeg: 200, exposure: 0.8, night: true, top: '#050408', bottom: '#241018' },
    sun: { color: '#ffd2a0', intensity: 1.25 },
    // stylized pass (2026-10): the cave stays a cave, but the crystal-violet sky fill and lava bounce are stronger and
    // a shadowless amber back fill (the work lamps) keeps the karts' shaded sides in colour; shadows stay soft, rims
    // a little lower so bodies do not wash out, and bloom is held to the lamps, crystals and lava
    hemi: { sky: '#9aa6e8', ground: '#c4734a', intensity: 1.2 },
    fill: { color: '#ffb985', intensity: 0.3 },
    shadowStrength: 0.6,
    envIntensity: 0.25,
    rimBoost: 1.6,
    bloom: 0.38,
    fogColor: '#22171f',
    grade: { saturation: 1.04, tint: '#ffffff', shadows: '#e8e4ff', highlights: '#fff2e2' },
  }, { ...EMBER_PROPS, ...EMBER_DRESSING });
  // elevated ribbons get skirts down to the terrain: make them read as basalt embankments, not grey concrete
  const base = kit.materials;
  kit.materials = () => ({ ...base(), underside: MaterialLibrary.world({ color: '#2f2830', color2: '#40353a', roughness: 0.92, noiseScale: 0.35, vertexAO: true }) });
  return kit;
};
