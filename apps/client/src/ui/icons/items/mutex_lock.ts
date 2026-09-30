import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'mutex_lock',
  category: 'utility',
  glyph: `<path d="M22 28v-7a10 10 0 0 1 20 0v7" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
<path d="M22 28v-7a10 10 0 0 1 20 0v7" fill="none" stroke="#b0aea5" stroke-width="3.2" stroke-linecap="round"/>
<rect x="14" y="27" width="36" height="28" rx="6" fill="#ffd23f" ${S}/>
<circle cx="32" cy="38" r="4" fill="${INK}"/><path d="M32 40v7" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="8" cy="12" r="3.5" fill="#e5484d" ${S}/><circle cx="56" cy="12" r="3.5" fill="#7bd88f" ${S}/>`,
});
