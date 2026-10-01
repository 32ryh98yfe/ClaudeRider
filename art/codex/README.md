# Codex prompt pack (110 slots) · Codex 프롬프트 팩

The game ships complete with procedural art. Every 2D slot below can be replaced by an image you generate with ChatGPT / Codex on your own PC; dropped files override the procedural fallback automatically.
게임은 절차적으로 생성한 아트만으로 완성된 상태로 제공됩니다. 아래의 모든 2D 슬롯은 사용자의 PC에서 ChatGPT / Codex로 생성한 이미지로 바꿀 수 있으며, 넣어 둔 파일이 자동으로 절차적 아트를 대체합니다.

| Kind | Slots | Size (px) |
|---|---|---|
| portrait | 12 | 512 × 512 |
| hero | 12 | 1024 × 1536 |
| kart | 8 | 1024 × 640 |
| thumb | 20 | 640 × 360 |
| loading | 20 | 1920 × 1080 |
| keyart | 11 | 1920 × 1080 |
| card | 4 | 768 × 1024 |
| logo | 1 | 2048 × 768 |
| icon | 18 | 256 × 256 |
| ui | 4 | 1920 × 1080 |

**English**
1. Pick a slot in `art/codex/manifest.json` and open `art/codex/prompts/<slotId>.md`.
2. (Optional) After `pnpm build`, `pnpm art:refs` renders reference images from the game's procedural art into `art/codex/refs/<slotId>.png`; attach the matching one.
3. In ChatGPT / Codex image generation paste the style guide (`art/codex/style-guide.md`), the English or Korean prompt, and the negative prompt.
4. Export at the slot size (or the same aspect ratio) as WebP (PNG if you need exact alpha); keep transparency for alpha slots.
5. Save as `apps/client/public/art/overrides/<slotId>.webp` — e.g. `portrait.clay.webp`.
6. `pnpm dev` picks it up immediately; with `pnpm start` reload the page; static hosting needs `pnpm build` again.

**한국어**
1. `art/codex/manifest.json`에서 슬롯을 고르고 `art/codex/prompts/<slotId>.md`를 엽니다.
2. (선택) `pnpm build` 후 `pnpm art:refs`를 실행하면 게임의 절차적 아트를 참조 이미지로 렌더링해 `art/codex/refs/<slotId>.png`에 만듭니다. 해당 이미지를 첨부합니다.
3. ChatGPT / Codex 이미지 생성에 스타일 가이드(`art/codex/style-guide.md`), 한국어 또는 영어 프롬프트, 네거티브 프롬프트를 붙여 넣습니다.
4. 슬롯 크기(또는 같은 비율)의 WebP(정확한 투명도가 필요하면 PNG)로 내보내고, 알파 슬롯은 투명 배경을 유지합니다.
5. `apps/client/public/art/overrides/<slotId>.webp`로 저장합니다(예: `portrait.clay.webp`).
6. `pnpm dev`에서는 바로 반영되고, `pnpm start`는 새로고침, 정적 호스팅은 `pnpm build`를 다시 실행합니다.

Regenerate this pack with `node tools/art/codex-pack.ts` (`pnpm art:pack`). IP rules: see the style guide — original designs only, no KartRider/Nexon or Claude/Anthropic marks.
