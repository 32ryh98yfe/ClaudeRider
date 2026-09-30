import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'attention_tether',
  category: 'speed',
  glyph: `<path d="M11 50C14 36 22 27 33 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.5 7"/>
<path d="M8 44l3 7 7-3" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="43" cy="23" r="12.5" fill="#fff" ${S}/>
<circle cx="43" cy="23" r="6" fill="${INK}"/><circle cx="45.4" cy="20.6" r="2" fill="#fff"/>
<path d="M29 12l3 4M43 5.5v4.5M56.5 12l-3 4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
});
