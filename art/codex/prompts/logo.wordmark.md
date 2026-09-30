---
id: logo.wordmark
size: 2048x768
alpha: true
format: webp
ref: ../refs/logo.wordmark.png
palette: [#FAF9F5, #D97757, #141413]
---
# logo.wordmark

Paste the **style guide** (`art/codex/style-guide.md`), then one of the prompts below, then the negative prompt. Attach `art/codex/refs/logo.wordmark.png` as the reference image when it exists (`pnpm art:refs`).
Export **2048 × 768** (or the same aspect ratio) with a transparent background, save as `apps/client/public/art/overrides/logo.wordmark.webp`.

## English
Original bold italic racing wordmark reading exactly "ClaudeRider" (this slot is the one exception that asks for text), heavy condensed italic letterforms, "Claude" in cream #FAF9F5 and "Rider" in coral #D97757, dark #141413 outline and a soft drop shadow, speed streaks, with an original parametric ten-ray sparkle to the left (never the Claude or Anthropic logo). Transparent background.

## 한국어
"ClaudeRider"라는 글자를 정확히 쓴 독창적인 굵은 이탤릭 레이싱 워드마크(이 슬롯만 예외적으로 글자를 요구함), 두껍고 좁은 이탤릭 글자꼴, "Claude"는 크림 #FAF9F5, "Rider"는 코랄 #D97757, 어두운 #141413 외곽선과 부드러운 그림자, 속도감 있는 줄무늬, 왼쪽에 독창적인 파라메트릭 10갈래 반짝이(Claude나 Anthropic 로고는 절대 사용 금지). 투명 배경.

## Negative prompt
text, watermark, logo, signature, letters, KartRider, Nexon, Dao, Bazzi, Anthropic logo, Claude logo, starburst logo, realistic human, photo, blurry, low quality, extra limbs, mouth, teeth

## Notes
- If the public title changes (VITE_PUBLIC_TITLE), regenerate this slot with the new text.
- Palette to stay close to: #FAF9F5 #D97757 #141413
