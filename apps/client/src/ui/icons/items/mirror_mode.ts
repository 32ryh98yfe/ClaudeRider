import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'mirror_mode',
  category: 'attack',
  glyph: `<rect x="21" y="8" width="22" height="40" rx="11" fill="#bfe9ff" ${S}/>
<path d="M27 16l9 10M28 25l6 7" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
<path d="M32 48v6M24 56h16" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
<path d="M17 24l-9 7 9 7M8 31h9M47 24l9 7-9 7M56 31h-9" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
});
