import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'turbo_token',
  category: 'speed',
  glyph: `<path d="M7 25h9M5 32h10M7 39h9" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
<circle cx="36" cy="32" r="17" fill="#ffd23f" ${S}/>
<circle cx="36" cy="32" r="11.5" fill="none" stroke="#e0952a" stroke-width="2.6"/>
<path d="M30 25.5l6.5 6.5-6.5 6.5M37 25.5l6.5 6.5-6.5 6.5" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
});
