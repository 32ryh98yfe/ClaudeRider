import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'prompt_missile',
  category: 'attack',
  glyph: `<path d="M14 50l-5 5M19 53l-3 5M11 45l-5 3" stroke="#ffd23f" stroke-width="3.4" stroke-linecap="round"/>
<path d="M15 44l-3 9 9-3z" fill="#ffd23f" ${S}/>
<path d="M18 46l20-20c5-5 12-7 17-7 0 5-2 12-7 17L28 56z" fill="#faf9f5" ${S}/>
<path d="M21 36l-7 2 6-9 8-1zM28 43l-2 7 9-6 1-8z" fill="#d97757" ${S}/>
<path d="M32.5 33.5l4.5 3.5-4.5 3.5M38.5 42h5" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-45 38 37)"/>`,
});
