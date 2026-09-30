import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'token_bomb',
  category: 'attack',
  glyph: `<path d="M40 14c4-6 10-5 12-1" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
<path d="M53 6v6M50 9h6M49.5 5.5l7 7M56.5 5.5l-7 7" stroke="#ffd23f" stroke-width="2.4" stroke-linecap="round"/>
<rect x="33" y="14" width="10" height="8" rx="2" transform="rotate(35 38 18)" fill="#4d4c48" ${S}/>
<circle cx="30" cy="37" r="18" fill="#30302e" ${S}/>
<circle cx="30" cy="37" r="10" fill="none" stroke="#d97757" stroke-width="3.2"/>
<path d="M26.5 37h7M30 33.5v7" stroke="#d97757" stroke-width="3" stroke-linecap="round"/>
<path d="M18 29c2-4 5-6 9-7" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" opacity=".7"/>`,
});
