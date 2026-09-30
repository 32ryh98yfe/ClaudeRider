import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'alignment_halo',
  category: 'defense',
  glyph: `<ellipse cx="32" cy="18" rx="17" ry="6.5" fill="none" stroke="#ffd23f" stroke-width="5"/>
<ellipse cx="32" cy="18" rx="17" ry="6.5" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".6"/>
<rect x="17" y="31" width="30" height="20" rx="5" fill="#d87656" ${S}/>
<rect x="24" y="37" width="3.4" height="7.5" rx="1" fill="${INK}"/><rect x="36.6" y="37" width="3.4" height="7.5" rx="1" fill="${INK}"/>
<path d="M11 31v-4M53 31v-4M8 40h4M52 40h4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
});
