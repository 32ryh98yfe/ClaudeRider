import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'overclock_aura',
  category: 'speed',
  glyph: `<circle cx="32" cy="32" r="24" fill="none" stroke="#fff" stroke-width="2.4" opacity=".55"/>
<circle cx="32" cy="32" r="19.5" fill="none" stroke="#fff" stroke-width="2.4" opacity=".85"/>
<path d="M26 16v5M32 16v5M38 16v5M26 43v5M32 43v5M38 43v5M16 26h5M16 32h5M16 38h5M43 26h5M43 32h5M43 38h5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
<rect x="20.5" y="20.5" width="23" height="23" rx="4" fill="#faf9f5" ${S}/>
<path d="M34 23.5l-6.5 9.5h5.5l-3 7.5 7.5-10h-5.5z" fill="#ff7a30" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
});
