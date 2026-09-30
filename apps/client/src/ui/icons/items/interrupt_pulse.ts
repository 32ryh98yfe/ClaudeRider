import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'interrupt_pulse',
  category: 'defense',
  glyph: `<circle cx="32" cy="32" r="25" fill="none" stroke="#fff" stroke-width="2.4" opacity=".5"/>
<circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="2.4" opacity=".8"/>
<circle cx="32" cy="32" r="13.5" fill="#faf9f5" ${S}/>
<path d="M21 30l4-5 4 5" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M42 27.5a6.2 6.2 0 1 0 0 9" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`,
});
