// Codex prompt pack generator (docs/design/60-codex-pipeline.md). Writes art/codex/{manifest.json, style-guide.md,
// README.md, prompts/<slotId>.md} and the bilingual drop-folder README. Deterministic: re-running yields identical files.
// Usage: node tools/art/codex-pack.ts
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent } from '@cr/content';
import { CHARACTERS, KARTS, TRACKS, THEMES, ITEMS, MODES, UI } from './codex-data.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'art/codex');
const PROMPTS = join(OUT, 'prompts');
const content = loadContent();

type Kind = 'portrait' | 'hero' | 'kart' | 'thumb' | 'loading' | 'keyart' | 'card' | 'icon' | 'logo' | 'ui';
interface Slot {
  id: string; kind: Kind; w: number; h: number; alpha: boolean; format: 'webp';
  prompt: string; ref: string; subject: Record<string, string>; palette: string[]; fallback: string;
  en: string; ko: string; notes: string[];
}

const STYLE_EN = `Glossy vinyl-toy chibi kart racer. Bright, saturated, toy-like 3D world with soft skylight and soft shadows; heavy bloom only on glowing effects (boost flames, drift sparks, neon, item cubes). Warm terracotta #D97757 / #C96442 and cream #FAF9F5 / parchment #F5F4ED as the signature palette, with the theme's accent colours. Characters are Clawd mascots: a rounded voxel-block creature with body proportions 1.0 wide : 0.68 tall : 0.64 deep, soft rounded edges, terracotta body #D87656 with a darker shade #BE684D, two vertical black rectangular eye slots #141413, no mouth, two small stub arms, four tiny stub legs hidden in the kart, and a small original ten-ray sparkle floating just above the head. Clearcoat vinyl material with a warm peach rim light (#FFD9C7). Karts are chunky, rounded, toy-like, with emissive details. Key art uses a Dutch-angle wide-lens composition with foreground, midground and background layers and motion blur at the edges.`;
const STYLE_KO = `광택 있는 비닐 토이 스타일의 치비 카트 레이싱. 부드러운 하늘빛 조명과 부드러운 그림자가 있는 밝고 채도 높은 장난감 같은 3D 세계. 강한 블룸은 빛나는 효과(부스터 불꽃, 드리프트 불꽃, 네온, 아이템 큐브)에만 사용. 따뜻한 테라코타 #D97757 / #C96442와 크림 #FAF9F5 / 양피지 #F5F4ED를 대표 팔레트로, 테마의 포인트 색을 더함. 캐릭터는 클로드(Clawd) 마스코트: 가로 1.0 : 세로 0.68 : 깊이 0.64 비율의 둥근 모서리 복셀 블록 생명체로, 몸은 테라코타 #D87656, 어두운 면은 #BE684D, 세로로 긴 검은 직사각형 눈 슬롯 두 개 #141413, 입 없음, 작은 뭉툭한 팔 두 개, 카트 안에 숨은 작은 다리 네 개, 머리 바로 위에 떠 있는 독창적인 10갈래 반짝이. 따뜻한 복숭앗빛 림 라이트(#FFD9C7)가 도는 클리어코트 비닐 재질. 카트는 두툼하고 둥근 장난감 형태에 발광 디테일. 키 아트는 전경·중경·배경 레이어와 가장자리 모션 블러가 있는 더치 앵글 광각 구도.`;
const ALWAYS_EN = 'Always: original designs only; consistent character design across images; clean silhouettes readable at small sizes; transparent background when the slot says alpha.';
const NEVER_EN = 'Never: text, letters, numbers or watermarks (unless the slot asks for them); KartRider or Nexon names, characters, karts, tracks, logos or fonts; the Claude or Anthropic logo, the exact Claude "spark" mark, or the Anthropic "A"; real brands or sponsor logos; photorealistic humans; gore; mouths on the Clawd characters.';
const ALWAYS_KO = '항상: 독창적인 디자인만 사용, 이미지 간 캐릭터 디자인 일관성 유지, 작은 크기에서도 읽히는 깔끔한 실루엣, 알파 슬롯은 투명 배경.';
const NEVER_KO = '금지: 글자·문자·숫자·워터마크(슬롯이 요구할 때 제외), 카트라이더나 넥슨의 이름·캐릭터·카트·트랙·로고·폰트, Claude 또는 Anthropic 로고와 정확한 Claude "스파크" 마크, Anthropic "A", 실제 브랜드나 스폰서 로고, 사실적인 인간, 잔혹한 표현, 클로드 캐릭터의 입.';
const NEGATIVE = 'text, watermark, logo, signature, letters, KartRider, Nexon, Dao, Bazzi, Anthropic logo, Claude logo, starburst logo, realistic human, photo, blurry, low quality, extra limbs, mouth, teeth';

const slots: Slot[] = [];
const add = (s: Omit<Slot, 'format' | 'prompt' | 'ref'>): void => { slots.push({ ...s, format: 'webp', prompt: `prompts/${s.id}.md`, ref: `refs/${s.id}.png` }); };
const kartOf = (id: string): (typeof KARTS)[number] => KARTS.find((k) => k.id === id)!;
const themePalette = (themeId: string): string[] => [...(content.themes.byId.get(themeId as never)?.palette ?? [])];
const themeOfTrack = (trackId: string): string => content.tracks.byId.get(trackId as never)?.themeId ?? 'clayhill_village';

for (const c of CHARACTERS) {
  add({ id: `portrait.${c.id}`, kind: 'portrait', w: 512, h: 512, alpha: true, subject: { characterId: c.id }, palette: c.palette, fallback: 'showcase.portrait',
    en: `Glossy vinyl-toy chibi mascot portrait, head-and-shoulders, three-quarter view facing slightly left. The character "${c.en}" is ${c.lookEn}. It is a rounded voxel-block Clawd creature (proportions 1.0 wide, 0.68 tall, 0.64 deep, soft rounded edges) with two vertical eye slots (unless the costume replaces them), no mouth, small stub arms, and a small original ten-ray sparkle floating just above its head. Clearcoat vinyl material, warm peach rim light, soft studio lighting on a transparent background, crisp silhouette, expression shown only through the eyes. Centered, fills 80% of the frame. No text.`,
    ko: `광택 있는 비닐 토이 느낌의 치비 마스코트 초상화, 머리와 어깨가 보이는 약간 왼쪽을 향한 3/4 각도. 캐릭터 "${c.ko}"는 ${c.lookKo}입니다. 둥근 모서리의 복셀 블록 클로드 생명체(가로 1.0, 세로 0.68, 깊이 0.64 비율)로, 세로로 긴 눈 슬롯 두 개(의상이 대신하는 경우 제외)가 있고 입은 없으며, 작은 뭉툭한 팔과 머리 바로 위에 떠 있는 독창적인 10갈래 반짝이가 있습니다. 클리어코트 비닐 재질, 따뜻한 복숭앗빛 림 라이트, 투명 배경의 부드러운 스튜디오 조명, 또렷한 실루엣, 표정은 눈으로만 표현. 화면 중앙, 프레임의 80%를 채움. 글자 없음.`,
    notes: ['Used in room slots, standings icons, garage list and results; must read at 48 px.', 'Keep the eye slots and sparkle consistent with the hero image of the same character.'] });
}
for (const c of CHARACTERS) {
  const k = kartOf(c.kart);
  add({ id: `hero.${c.id}`, kind: 'hero', w: 1024, h: 1536, alpha: true, subject: { characterId: c.id, kartBodyId: k.id }, palette: c.palette, fallback: 'showcase.hero',
    en: `Full-body hero render of the character "${c.en}" driving the "${k.en}" kart (${k.lookEn}), dynamic low three-quarter angle, the kart leaning into a drift with coral and gold drift sparks streaming from the rear wheels and a short boost flame. ${c.en} is ${c.lookEn}: a rounded voxel-block Clawd creature (1.0 : 0.68 : 0.64 proportions), no mouth, a small original ten-ray sparkle floating above the head. Glossy vinyl and candy-paint materials, strong rim light, bloom only on sparks and flames, motion blur on the background edges only, transparent background. No text, no logos.`,
    ko: `캐릭터 "${c.ko}"가 카트 "${k.ko}"(${k.lookKo})를 타고 있는 전신 히어로 렌더, 역동적인 낮은 3/4 앵글. 카트는 드리프트하며 기울어져 있고 뒷바퀴에서 코랄색·금색 드리프트 불꽃이 흩날리며 짧은 부스터 불꽃이 보입니다. ${c.ko}는 ${c.lookKo}로, 둥근 복셀 블록 형태의 클로드 생명체(1.0 : 0.68 : 0.64 비율)이며 입이 없고 머리 위에 독창적인 10갈래 반짝이가 떠 있습니다. 광택 비닐과 캔디 페인트 재질, 강한 림 라이트, 불꽃에만 블룸, 배경 가장자리에만 모션 블러, 투명 배경. 글자와 로고 없음.`,
    notes: ['Garage detail, results podium backdrop and loading cards (cropped): keep the character in the upper two-thirds.'] });
}
for (const k of KARTS) {
  add({ id: `kart.${k.id}`, kind: 'kart', w: 1024, h: 640, alpha: true, subject: { kartBodyId: k.id }, palette: ['#D97757', '#FAF9F5', '#141413'], fallback: 'showcase.kart',
    en: `Product render of the original toy kart "${k.en}": ${k.lookEn}. Three-quarter front view from slightly above, default livery in terracotta #D97757 and cream #FAF9F5 with dark #141413 trim, chunky rounded toy proportions, glossy candy paint, soft studio lighting with a gentle rim light, empty driver seat, transparent background. No text, no numbers, no logos.`,
    ko: `독창적인 장난감 카트 "${k.ko}"의 제품 렌더: ${k.lookKo}. 약간 위에서 본 앞쪽 3/4 각도, 테라코타 #D97757와 크림 #FAF9F5에 어두운 #141413 장식의 기본 도색, 두툼하고 둥근 장난감 비율, 광택 캔디 페인트, 은은한 림 라이트의 부드러운 스튜디오 조명, 빈 운전석, 투명 배경. 글자·숫자·로고 없음.`,
    notes: ['Garage kart list and detail; silhouette must be distinct from the other 7 karts.'] });
}
for (const t of TRACKS) {
  const th = themeOfTrack(t.id);
  add({ id: `thumb.${t.id}`, kind: 'thumb', w: 640, h: 360, alpha: false, subject: { trackId: t.id, themeId: th }, palette: themePalette(th), fallback: 'track.thumb',
    en: `Small track thumbnail for "${t.en}": ${t.sceneEn}. The road is clearly visible sweeping through the frame, one Clawd kart racer drifting with sparks, bright readable colours in the theme palette, toy-diorama look, slight tilt-shift depth of field. Must read clearly at 320 × 180. No text.`,
    ko: `트랙 "${t.ko}"의 작은 썸네일: ${t.sceneKo}. 도로가 화면을 가로지르며 또렷하게 보이고, 클로드 카트 레이서 한 명이 불꽃을 튀기며 드리프트, 테마 팔레트의 밝고 읽기 쉬운 색, 장난감 디오라마 느낌, 약한 틸트 시프트 피사계 심도. 320 × 180에서도 잘 읽혀야 함. 글자 없음.`,
    notes: ['Track pickers, room, matching stage and Time Attack.'] });
}
for (const t of TRACKS) {
  const th = themeOfTrack(t.id);
  add({ id: `loading.${t.id}`, kind: 'loading', w: 1920, h: 1080, alpha: false, subject: { trackId: t.id, themeId: th }, palette: themePalette(th), fallback: 'track.poster',
    en: `Wide cinematic loading screen for the track "${t.en}": ${t.sceneEn}. Three Clawd kart racers drift through the scene in a tight pack, drift sparks and boost flames glowing. Theme palette ${themePalette(th).join(', ')}, long soft shadows. Dutch angle, wide lens, layered foreground, midground (racers) and background (landmarks). Leave the lower-left quarter calm for the title overlay. No text.`,
    ko: `트랙 "${t.ko}"의 와이드 시네마틱 로딩 화면: ${t.sceneKo}. 클로드 카트 레이서 세 명이 촘촘하게 붙어 드리프트하며 지나가고, 드리프트 불꽃과 부스터 불꽃이 빛납니다. 테마 팔레트 ${themePalette(th).join(', ')}, 길고 부드러운 그림자. 더치 앵글, 광각 렌즈, 전경·중경(레이서)·배경(랜드마크) 레이어 구성. 타이틀이 들어갈 왼쪽 아래 1/4은 차분하게 비워 둘 것. 글자 없음.`,
    notes: ['The game overlays the track title and tips bottom-left.'] });
}
for (const th of THEMES) {
  add({ id: `keyart.${th.id}`, kind: 'keyart', w: 1920, h: 1080, alpha: false, subject: { themeId: th.id }, palette: themePalette(th.id), fallback: 'theme.vignette',
    en: `Theme key art for "${th.en}": ${th.moodEn}. A vignette with three Clawd kart racers mid-drift, landmark props of the theme around them, theme palette ${themePalette(th.id).join(', ')}, glossy toy-diorama rendering, Dutch angle, depth of field. No text.`,
    ko: `테마 "${th.ko}"의 키 아트: ${th.moodKo}. 드리프트 중인 클로드 카트 레이서 세 명과 그 주위의 테마 랜드마크 소품으로 구성된 비네트, 테마 팔레트 ${themePalette(th.id).join(', ')}, 광택 있는 장난감 디오라마 렌더링, 더치 앵글, 피사계 심도. 글자 없음.`,
    notes: ['Theme headers and lobby news tiles.'] });
}
for (const m of MODES) {
  add({ id: `card.${m.id}`, kind: 'card', w: 768, h: 1024, alpha: true, subject: { mode: m.id }, palette: ['#D97757', '#C96442', '#FAF9F5'], fallback: 'showcase.card',
    en: `Mode-select card art for "${m.en}": ${m.sceneEn}. Character and kart cut-out bleeding off the card edge, dynamic diagonal composition, glossy vinyl-toy rendering, terracotta and cream accents, white-to-transparent background. No text.`,
    ko: `모드 선택 카드 일러스트 "${m.ko}": ${m.sceneKo}. 카드 가장자리 밖으로 뻗어 나가는 캐릭터와 카트 컷아웃, 역동적인 대각선 구도, 광택 비닐 토이 렌더링, 테라코타와 크림 포인트, 흰색에서 투명으로 이어지는 배경. 글자 없음.`,
    notes: ['The UI overlays the mode name; keep the top 20% clear.'] });
}
add({ id: 'keyart.title', kind: 'keyart', w: 2560, h: 1440, alpha: false, subject: {}, palette: ['#D97757', '#FAF9F5', '#FF8C42', '#6A4C93'], fallback: 'title.lineup',
  en: `Epic title key art for an original toy kart racer: all twelve Clawd mascot racers (${CHARACTERS.map((c) => c.en).join(', ')}) charge toward the viewer down a sunlit hill-town road that curves toward a futuristic stadium city at sunset, Dutch-angle wide-lens composition. The classic terracotta Clawd with an ivory scarf leads in a pebble-shaped go-kart. Every racer is a rounded voxel block with two vertical eye slots (or its costume visor) and no mouth, with a small ten-ray sparkle above the head. Boost flames, drift sparks, confetti and floating item cubes; warm terracotta and cream palette with a sunset gradient #FF8C42 → #6A4C93. Glossy vinyl-toy rendering, strong rim light, depth of field on the far city, motion blur at the frame edges. Leave the upper-centre area clear for the wordmark. No text, no logos.`,
  ko: `독창적인 토이 카트 레이싱 게임의 웅장한 타이틀 키 아트: 열두 명의 클로드 마스코트 레이서 전원(${CHARACTERS.map((c) => c.ko).join(', ')})이 해 질 녘 미래형 스타디움 도시를 향해 휘어지는 햇살 가득한 언덕 마을 도로를 따라 화면 쪽으로 돌진합니다. 더치 앵글 광각 구도. 아이보리 스카프를 두른 클래식 테라코타 클로드가 조약돌 모양 고카트로 선두. 모든 레이서는 세로로 긴 눈 슬롯 두 개(또는 의상 바이저)가 있고 입이 없는 둥근 복셀 블록이며, 머리 위에 작은 10갈래 반짝이가 떠 있습니다. 부스터 불꽃, 드리프트 불꽃, 색종이, 떠다니는 아이템 큐브. 따뜻한 테라코타와 크림 팔레트에 노을 그라데이션 #FF8C42 → #6A4C93. 광택 비닐 토이 렌더링, 강한 림 라이트, 먼 도시에 피사계 심도, 프레임 가장자리 모션 블러. 워드마크를 위해 상단 중앙을 비워 둘 것. 글자와 로고 없음.`,
  notes: ['Title screen; the wordmark is composited on top.'] });
add({ id: 'logo.wordmark', kind: 'logo', w: 2048, h: 768, alpha: true, subject: {}, palette: ['#FAF9F5', '#D97757', '#141413'], fallback: 'logo.canvas',
  en: 'Original bold italic racing wordmark reading exactly "ClaudeRider" (this slot is the one exception that asks for text), heavy condensed italic letterforms, "Claude" in cream #FAF9F5 and "Rider" in coral #D97757, dark #141413 outline and a soft drop shadow, speed streaks, with an original parametric ten-ray sparkle to the left (never the Claude or Anthropic logo). Transparent background.',
  ko: '"ClaudeRider"라는 글자를 정확히 쓴 독창적인 굵은 이탤릭 레이싱 워드마크(이 슬롯만 예외적으로 글자를 요구함), 두껍고 좁은 이탤릭 글자꼴, "Claude"는 크림 #FAF9F5, "Rider"는 코랄 #D97757, 어두운 #141413 외곽선과 부드러운 그림자, 속도감 있는 줄무늬, 왼쪽에 독창적인 파라메트릭 10갈래 반짝이(Claude나 Anthropic 로고는 절대 사용 금지). 투명 배경.',
  notes: ['If the public title changes (VITE_PUBLIC_TITLE), regenerate this slot with the new text.'] });
for (const it of ITEMS) {
  add({ id: `icon.item.${it.id}`, kind: 'icon', w: 256, h: 256, alpha: true, subject: { itemId: it.id }, palette: ['#D97757', '#FAF9F5', '#6A9BCC'], fallback: `ui.icons.items.${it.id}`,
    en: `Game item icon for "${it.en}", centred, bold and readable at 48 px: ${it.iconEn}. Soft outline, cheerful glossy toy style, coral #D97757 and cream #FAF9F5 accents, slight drop shadow, transparent background. No text, no letters, no numbers.`,
    ko: `아이템 "${it.ko}"의 게임 아이콘, 중앙 배치, 48px에서도 또렷한 굵은 형태: ${it.iconKo}. 부드러운 외곽선, 명랑한 광택 토이 스타일, 코랄 #D97757와 크림 #FAF9F5 포인트, 약한 그림자, 투명 배경. 글자·문자·숫자 없음.`,
    notes: ['HUD item slots (big 8 vh / small 5.6 vh), item feed and results; keep the silhouette unique among the 18 icons.'] });
}
for (const u of UI) {
  add({ id: u.id, kind: 'ui', w: u.w, h: u.h, alpha: false, subject: {}, palette: ['#F5F4ED', '#FAF9F5', '#D97757'], fallback: `ui.${u.id.slice(3)}`,
    en: `${u.en}. Soft, low-contrast, warm; must not compete with UI text on top. No text.`,
    ko: `${u.ko}. 부드럽고 대비가 낮으며 따뜻한 느낌, 위에 올라갈 UI 글자와 경쟁하지 않을 것. 글자 없음.`,
    notes: u.id === 'ui.pattern_parchment' ? ['Must tile seamlessly in both directions.'] : ['Background plate; the 3D showcase or UI panels sit on top.'] });
}

if (slots.length !== 110) throw new Error(`expected 110 slots, got ${slots.length}`);
if (new Set(slots.map((s) => s.id)).size !== slots.length) throw new Error('duplicate slot ids');

mkdirSync(PROMPTS, { recursive: true });
for (const f of readdirSync(PROMPTS)) if (f.endsWith('.md')) rmSync(join(PROMPTS, f));
const md = (s: Slot): string => `---
id: ${s.id}
size: ${s.w}x${s.h}
alpha: ${s.alpha}
format: ${s.format}
ref: ../${s.ref}
palette: [${s.palette.join(', ')}]
---
# ${s.id}

Paste the **style guide** (\`art/codex/style-guide.md\`), then one of the prompts below, then the negative prompt. Attach \`art/codex/${s.ref}\` as the reference image when it exists (\`pnpm art:refs\`).
Export **${s.w} × ${s.h}** (or the same aspect ratio)${s.alpha ? ' with a transparent background' : ''}, save as \`apps/client/public/art/overrides/${s.id}.webp\`.

## English
${s.en}

## 한국어
${s.ko}

## Negative prompt
${NEGATIVE}

## Notes
${s.notes.map((n) => `- ${n}`).join('\n')}
- Palette to stay close to: ${s.palette.join(' ')}
`;
for (const s of slots) writeFileSync(join(PROMPTS, `${s.id}.md`), md(s));

const manifest = { version: 1, styleGuide: 'style-guide.md', count: slots.length, slots: slots.map(({ en: _en, ko: _ko, notes: _n, ...rest }) => rest) };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

writeFileSync(join(OUT, 'style-guide.md'), `# House style — ClaudeRider (paste into every prompt)

## English
${STYLE_EN}

${ALWAYS_EN}

${NEVER_EN}

## 한국어
${STYLE_KO}

${ALWAYS_KO}

${NEVER_KO}

## Negative prompt (all slots)
${NEGATIVE}
`);

const byKind = new Map<string, number>();
for (const s of slots) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
const table = [...byKind.entries()].map(([k, n]) => `| ${k} | ${n} | ${slots.find((s) => s.kind === k)!.w} × ${slots.find((s) => s.kind === k)!.h} |`).join('\n');
const dropSteps = `**English**
1. Pick a slot in \`art/codex/manifest.json\` and open \`art/codex/prompts/<slotId>.md\`.
2. (Optional) \`pnpm art:refs\` renders reference images from the game's procedural art into \`art/codex/refs/\`; attach the matching one.
3. In ChatGPT / Codex image generation paste the style guide (\`art/codex/style-guide.md\`), the English or Korean prompt, and the negative prompt.
4. Export at the slot size (or the same aspect ratio) as WebP (PNG if you need exact alpha); keep transparency for alpha slots.
5. Save as \`apps/client/public/art/overrides/<slotId>.webp\` — e.g. \`portrait.clay.webp\`.
6. \`pnpm dev\` picks it up immediately; with \`pnpm start\` reload the page; static hosting needs \`pnpm build\` again.

**한국어**
1. \`art/codex/manifest.json\`에서 슬롯을 고르고 \`art/codex/prompts/<slotId>.md\`를 엽니다.
2. (선택) \`pnpm art:refs\`로 게임의 절차적 아트를 참조 이미지로 렌더링해 \`art/codex/refs/\`에 만듭니다. 해당 이미지를 첨부합니다.
3. ChatGPT / Codex 이미지 생성에 스타일 가이드(\`art/codex/style-guide.md\`), 한국어 또는 영어 프롬프트, 네거티브 프롬프트를 붙여 넣습니다.
4. 슬롯 크기(또는 같은 비율)의 WebP(정확한 투명도가 필요하면 PNG)로 내보내고, 알파 슬롯은 투명 배경을 유지합니다.
5. \`apps/client/public/art/overrides/<slotId>.webp\`로 저장합니다(예: \`portrait.clay.webp\`).
6. \`pnpm dev\`에서는 바로 반영되고, \`pnpm start\`는 새로고침, 정적 호스팅은 \`pnpm build\`를 다시 실행합니다.`;
writeFileSync(join(OUT, 'README.md'), `# Codex prompt pack (${slots.length} slots) · Codex 프롬프트 팩

The game ships complete with procedural art. Every 2D slot below can be replaced by an image you generate with ChatGPT / Codex on your own PC; dropped files override the procedural fallback automatically.
게임은 절차적으로 생성한 아트만으로 완성된 상태로 제공됩니다. 아래의 모든 2D 슬롯은 사용자의 PC에서 ChatGPT / Codex로 생성한 이미지로 바꿀 수 있으며, 넣어 둔 파일이 자동으로 절차적 아트를 대체합니다.

| Kind | Slots | Size (px) |
|---|---|---|
${table}

${dropSteps}

Regenerate this pack with \`node tools/art/codex-pack.ts\` (\`pnpm art:pack\`). IP rules: see the style guide — original designs only, no KartRider/Nexon or Claude/Anthropic marks.
`);

const overrides = join(ROOT, 'apps/client/public/art/overrides');
mkdirSync(overrides, { recursive: true });
writeFileSync(join(overrides, '.gitkeep'), '');
writeFileSync(join(overrides, 'README.md'), `# Art overrides · 아트 교체 폴더

Drop generated images here as \`<slotId>.webp\` (or .png/.jpg). Prompts and sizes: \`art/codex/\`.
생성한 이미지를 \`<slotId>.webp\`(또는 .png/.jpg) 이름으로 이 폴더에 넣으세요. 프롬프트와 크기는 \`art/codex/\`에 있습니다.

${dropSteps}
`);
console.log(`codex-pack: ${slots.length} slots → art/codex/ (${[...byKind.entries()].map(([k, n]) => `${k} ${n}`).join(', ')})`);
