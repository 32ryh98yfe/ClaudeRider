import { defineItemIcon, S } from './_def.ts';

export default defineItemIcon({
  id: 'glitch_puddle',
  category: 'trap',
  glyph: `<ellipse cx="30" cy="42" rx="24" ry="11" fill="#2acaff" opacity=".85"/>
<ellipse cx="34" cy="42" rx="24" ry="11" fill="#ff5a8a" opacity=".85"/>
<ellipse cx="32" cy="42" rx="23" ry="10" fill="#7a5cff" ${S}/>
<rect x="18" y="37" width="6" height="4" fill="#fff"/><rect x="27" y="43" width="9" height="3" fill="#2acaff"/><rect x="40" y="38" width="5" height="5" fill="#ff5a8a"/>
<rect x="20" y="16" width="7" height="7" fill="#fff" ${S}/><rect x="33" y="10" width="6" height="6" fill="#2acaff" ${S}/><rect x="42" y="20" width="5" height="5" fill="#ff5a8a" ${S}/>`,
});
