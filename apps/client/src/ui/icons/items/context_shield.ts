import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'context_shield',
  category: 'defense',
  glyph: `<path d="M32 6l20 7v14c0 14-8 24-20 31C20 51 12 41 12 27V13z" fill="#faf9f5" ${S}/>
<path d="M32 11.5l15 5.2V27c0 10.5-6 18.3-15 24-9-5.7-15-13.5-15-24V16.7z" fill="#6ab8ff" stroke="none"/>
<path d="M27 21c-3 0-4 1.5-4 4v2.5c0 1.8-1 3-3 3 2 0 3 1.2 3 3V36c0 2.5 1 4 4 4M37 21c3 0 4 1.5 4 4v2.5c0 1.8 1 3 3 3-2 0-3 1.2-3 3V36c0 2.5-1 4-4 4" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
});
