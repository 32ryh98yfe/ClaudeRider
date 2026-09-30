import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'interpretability_lens',
  category: 'utility',
  glyph: `<path d="M40 40l14 14" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
<path d="M40 40l14 14" stroke="#c96442" stroke-width="4" stroke-linecap="round"/>
<circle cx="27" cy="27" r="17" fill="#e8f6ff" ${S}/>
<path d="M19 22l8 6 8-7M19 33l8-5 8 5" fill="none" stroke="#3f8a55" stroke-width="2.2"/>
<circle cx="19" cy="22" r="3" fill="#3f8a55" stroke="${INK}" stroke-width="1.6"/><circle cx="19" cy="33" r="3" fill="#3f8a55" stroke="${INK}" stroke-width="1.6"/>
<circle cx="27" cy="28" r="3.4" fill="#ffd23f" stroke="${INK}" stroke-width="1.6"/>
<circle cx="35" cy="21" r="3" fill="#3f8a55" stroke="${INK}" stroke-width="1.6"/><circle cx="35" cy="33" r="3" fill="#3f8a55" stroke="${INK}" stroke-width="1.6"/>`,
});
