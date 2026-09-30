import { defineItemIcon, INK, S } from './_def.ts';

export default defineItemIcon({
  id: 'bug_report',
  category: 'attack',
  glyph: `<circle cx="32" cy="33" r="23" fill="#bfe9ff" fill-opacity=".45" stroke="#fff" stroke-width="2.6"/>
<path d="M18 22c3-6 8-6 10-5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
<path d="M22 30l-6-3M22 37h-7M23 44l-6 4M42 30l6-3M42 37h7M41 44l6 4M28 20l-3-5M36 20l3-5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
<ellipse cx="32" cy="38" rx="10" ry="12" fill="#e5484d" ${S}/>
<circle cx="32" cy="24.5" r="6" fill="${INK}"/>
<path d="M32 27v22" stroke="${INK}" stroke-width="2.4"/>
<circle cx="27.5" cy="36" r="2.2" fill="${INK}"/><circle cx="36.5" cy="42" r="2.2" fill="${INK}"/><circle cx="36.5" cy="34" r="1.6" fill="${INK}"/>`,
});
