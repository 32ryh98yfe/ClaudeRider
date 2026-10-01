# Art overrides · 아트 교체 폴더

Drop generated images here as `<slotId>.webp` (or .png/.jpg). Prompts and sizes: `art/codex/`.
생성한 이미지를 `<slotId>.webp`(또는 .png/.jpg) 이름으로 이 폴더에 넣으세요. 프롬프트와 크기는 `art/codex/`에 있습니다.

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
