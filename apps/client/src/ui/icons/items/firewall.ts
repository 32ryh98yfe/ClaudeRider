import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'firewall',
  category: 'trap',
  glyph: `<path d="M14 30c-2-6 2-10 5-14 0 4 3 6 5 6 0-6 3-11 8-15 0 6 5 8 5 14 2-2 3-4 3-7 5 4 7 10 5 16z" fill="#ff7a30" ${S}/>
<path d="M22 30c0-4 3-6 5-9 1 4 4 5 4 9M36 30c0-3 2-5 4-6 1 3 1 5 0 6" fill="#ffd23f" stroke="none"/>
<rect x="9" y="29" width="46" height="26" rx="3" fill="#c96442" ${S}/>
<path d="M9 38h46M9 46.5h46M22 29v9M40 29v9M31 38v8.5M49 38v8.5M16 46.5V55M40 46.5V55" stroke="${INK}" stroke-width="2.4"/>`,
});
