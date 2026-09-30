import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'top1_missile',
  category: 'attack',
  glyph: `<path d="M15 44l-3 9 9-3z" fill="#ffd23f" ${S}/>
<path d="M18 46l20-20c5-5 12-7 17-7 0 5-2 12-7 17L28 56z" fill="#faf9f5" ${S}/>
<path d="M21 36l-7 2 6-9 8-1zM28 43l-2 7 9-6 1-8z" fill="#d97757" ${S}/>
<circle cx="37" cy="37" r="7.5" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/>
<path d="M35.6 34.6l2-1.6v8" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8 10l4 8h12l4-8-6 4-4-6-4 6z" fill="#ffd23f" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
});
