import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'redaction_cloud',
  category: 'trap',
  glyph: `<path d="M17 45c-6 0-10-4-10-9s4-9 9-9c1-7 7-12 14-12 6 0 11 4 13 9 1 0 2-1 4-1 6 0 10 5 10 11s-4 11-10 11z" fill="#faf9f5" ${S}/>
<rect x="15" y="28" width="30" height="6" rx="1.5" fill="${INK}"/>
<rect x="19" y="37.5" width="28" height="6" rx="1.5" fill="${INK}"/>
<path d="M20 52l-2 5M30 52l-2 5M40 52l-2 5" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>`,
});
