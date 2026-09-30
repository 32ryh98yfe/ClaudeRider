import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'throttle_drone',
  category: 'attack',
  glyph: `<path d="M20 26l-8-7M44 26l8-7M20 38l-8 7M44 38l8 7" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="12" cy="18" rx="8" ry="3" fill="#faf9f5" ${S}/><ellipse cx="52" cy="18" rx="8" ry="3" fill="#faf9f5" ${S}/>
<ellipse cx="12" cy="46" rx="8" ry="3" fill="#faf9f5" ${S}/><ellipse cx="52" cy="46" rx="8" ry="3" fill="#faf9f5" ${S}/>
<rect x="17" y="23" width="30" height="18" rx="7" fill="#30302e" ${S}/>
<path d="M22.5 27v5h5M26 27v9M31 27h4.5v4.5H31V36h4.5M38.5 27h4.5v9h-4.5M38.5 31.5h4.5" fill="none" stroke="#ff6b5a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="32" cy="48" r="3" fill="#ff6b5a" ${S}/>`,
});
