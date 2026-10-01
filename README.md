# ClaudeRider · 클로드라이더

An original, non-commercial browser kart racer in the spirit of *KartRider: Drift*: drift to charge the boost gauge, fire boosters, battle with items. The racers are **Clawd**, Claude Code's orange block mascot, in 12 costume variations.

카트라이더: 드리프트의 손맛을 웹에서 재현한 비상업 팬 게임입니다. 드리프트로 게이지를 모으고 부스터를 터뜨리고, 아이템으로 경쟁합니다. 레이서는 Claude Code의 주황색 블록 마스코트 **클로드(Clawd)**이며, 12가지 의상 변형이 있습니다.

> **Disclaimer / 고지.** Unofficial fan project. Not affiliated with, endorsed or sponsored by Nexon or Anthropic. No Nexon assets, names or fonts are used.
> 비공식·비상업 팬 프로젝트입니다. 넥슨 및 Anthropic과 제휴·후원 관계가 없으며, 넥슨의 에셋·명칭·폰트를 사용하지 않습니다.

## Features · 특징
- **Modes:**
  - Speed race and Item race (18 original items).
  - Time Attack with your best-run ghost.
  - Duo and Squad teams.
- **Play:**
  - Quick Race against AI in four tiers (Rookie / Racer / Pro / Legend).
  - Online Quick Match (AI fills empty slots).
  - Custom Rooms with 6-character codes.
- **Content:**
  - 20 tracks in 10 themes, with branches, jumps, halfpipes, plazas, grind rails, warps, moving hazards, helices and loops.
  - 12 Clawd characters and 8 karts, with liveries.
- **Tech:**
  - three.js r186 `WebGPURenderer` with TSL node materials; falls back to WebGL2 automatically.
  - A deterministic 60 Hz simulation shared by the browser and the server.
  - Authoritative Node WebSocket server with client prediction and rollback.
  - Korean UI by default, English toggle.
- **Codex art pack:** 110 image slots, each with an English and Korean prompt. Drop generated images into `apps/client/public/art/overrides/` and they replace the procedural art. `pnpm art:refs` (after `pnpm build`) saves the current procedural art of every slot as a reference image. See [`art/codex/README.md`](art/codex/README.md).

## Run · 실행
Requires Node ≥ 22.18 and pnpm 10. / Node 22.18 이상, pnpm 10이 필요합니다.

```bash
pnpm install
pnpm bake          # compile tracks/**/*.ctd → apps/client/public/tracks   트랙 컴파일
pnpm build         # production client → apps/client/dist                  클라이언트 빌드
pnpm start         # http://127.0.0.1:8787  (static client + /ws game server) 게임 서버 + 정적 파일
```

- **Development:** `pnpm dev` runs Vite on :5173 (hot reload) and the game server on :8787.
- **Hosting:** `node apps/server/src/main.ts --host 0.0.0.0 --port 8787` serves the built client, `/health` and the WebSocket on `/ws`. Put it behind a TLS proxy for `wss://`, and add `--trust-proxy` (or `TRUST_PROXY=1`) so the per-address limits read the proxy's `X-Forwarded-For` header instead of the proxy's own address.
  - Default limits per address: 8 sockets, 16 sessions, 2 concurrent races, 10 failed room-code joins per minute. Server-wide: 50 races. All are set in `GameServerOptions.limits`.
- **Art overrides:** the server reads `apps/client/public/art/overrides/` live, so a dropped image shows on the next page load without a rebuild. `--art <dir>` adds another folder, which is checked first.
- **Offline play:** solo races run the authority in a Web Worker, so no server is needed.

개발 중에는 `pnpm dev`, 배포할 때는 위 명령으로 서버를 띄우면 됩니다. 오프라인 싱글 플레이는 서버 없이 브라우저에서 동작합니다.

## Controls · 조작
| Action · 동작 | Keyboard · 키보드 | Gamepad · 게임패드 |
|---|---|---|
| Steer · 조향 | ← → / A D | D-pad / stick |
| Accelerate · 가속 | ↑ / W | RT |
| Brake / reverse · 브레이크 | ↓ / S | LT |
| **Drift · 드리프트** | Shift / C | X, RB |
| Use item / booster · 아이템·부스터 | Ctrl / Space | A |
| Swap item · 아이템 교체 | Alt / E | B |
| Look back · 뒤 보기 | X | LB |
| Reset to track · 복귀 | R | Y |
| Pause · 일시정지 | Esc | Start |

Every key can be rebound in Settings → Controls. / 모든 키는 설정 → 조작에서 바꿀 수 있습니다.

**Tips · 팁**
- Drift through corners to fill the gauge. Each full gauge stores a booster; you can hold 2.
- Tap accelerate again right as a drift ends for an **instant boost**.
- Press accelerate the moment the countdown hits GO for a **perfect start**.
- Drift while a booster is running, then let go of the steering to **drag**: keep accelerate held and you climb to about 290 km/h. While dragging, tap the corner-direction key every 0.1–0.2 s for a **tap boost** (up to 3 in a row, about 305 km/h); mashing faster does not count.
- Counter-steer all the way in a drift to **cut** it and stop the slide at once. While boosting, keep drift held as you counter-steer instead and the gauge fills 3× faster.
- A short brake tap in a drift is a **brake turn** that whips the nose around. Hold the brake longer than about 0.18 s and you **spin out** and lose your speed.
- Hold brake while stopped to **reverse** (the speedometer shows an amber R). Press accelerate to drive forward again.

코너에서 드리프트하면 게이지가 차고, 가득 찰 때마다 부스터가 1개씩 저장됩니다(최대 2개). 드리프트가 끝나는 순간 가속을 다시 누르면 **순간 부스터**, GO와 동시에 가속하면 **퍼펙트 스타트**입니다.

부스터가 켜진 채 드리프트하다가 방향키를 놓으면 **끌기**로 약 290 km/h까지 올라가고, 끌기 중에 코너 방향키를 0.1–0.2초 간격으로 톡톡 두드리면 **톡톡이**(최대 3연속, 약 305 km/h)입니다. 너무 빨리 연타하면 무효예요. 드리프트 중 반대 방향키를 끝까지 꺾으면 **커팅**으로 미끄러짐이 바로 멈추고, 부스터 중에는 드리프트 키를 누른 채 반대로 꺾으면 게이지가 3배로 찹니다. 드리프트 중 브레이크를 짧게 누르면 **고속턴**, 0.18초 넘게 누르고 있으면 **스핀**해서 속도를 잃습니다. 멈춘 상태에서 브레이크를 계속 누르면 **후진**(속도계에 주황색 R)하고, 가속을 누르면 다시 전진합니다.

## Known limitations · 알려진 제한
- **Art:** all art is procedural (3D renders, gradients and icons drawn in code) until you drop Codex images into `apps/client/public/art/overrides/`.
- **Cross-engine check:** the Node-vs-browser determinism selftest runs only in Chromium. The race simulation itself uses exact arithmetic, but the test drives it with AI bots whose trigonometry may differ slightly between JavaScript engines. Online play isn't affected, because bots run only on the server, or in your own browser for offline races.
- **Names:** player names need at least one letter or digit. Emoji-only names are refused with the usual "invalid name" message.
- **Proxies:** `--trust-proxy` supports exactly one reverse proxy in front of the server.
- **Performance:** in headless or software-rendered browsers (no GPU), a race takes about 15–20 s to load. With a real GPU it is much faster.

- **아트:** Codex 이미지를 `apps/client/public/art/overrides/`에 넣기 전까지는 모든 아트가 코드로 만든 절차적 아트(3D 렌더, 그라디언트, 아이콘)입니다.
- **엔진 간 검증:** Node와 브라우저의 결정론(같은 입력이면 같은 결과)을 비교하는 자체 테스트는 Chromium에서만 돌립니다. 레이스 시뮬레이션은 정확한 사칙연산만 쓰지만, 테스트를 구동하는 AI 봇의 삼각함수는 자바스크립트 엔진마다 아주 조금 다를 수 있기 때문입니다. 봇은 서버(오프라인 레이스에서는 내 브라우저)에서만 돌기 때문에 온라인 플레이에는 영향이 없습니다.
- **이름:** 플레이어 이름에는 글자나 숫자가 하나 이상 있어야 합니다. 이모지만으로 된 이름은 기존 '잘못된 이름' 안내와 함께 거부됩니다.
- **프록시:** `--trust-proxy`는 서버 앞에 리버스 프록시가 하나만 있는 구성을 지원합니다.
- **성능:** GPU가 없는 헤드리스·소프트웨어 렌더링 브라우저에서는 레이스 로딩에 15–20초쯤 걸립니다. 실제 GPU에서는 훨씬 빠릅니다.

## Repository · 구조
| Path | What |
|---|---|
| `packages/sim` | Deterministic simulation: kart physics, track runtime, race rules, items, AI |
| `packages/trackc` | Track compiler: DSL `tracks/**/*.ctd` → `.ctrk` (physics) + `.vis` (render) |
| `packages/net`, `packages/room` | Binary protocol, NetClient (prediction and rollback), authoritative RaceRoom |
| `packages/content` | Data only: ids, items, effects, karts, characters, themes, challenges |
| `apps/client` | Vite + Preact client: renderer, HUD, screens, audio |
| `apps/server` | Node WebSocket server: lobby, matchmaking, rooms, static files |
| `docs/design` | Design specs (ADRs, sim, tracks, items, netcode, art bible, UI, audio, tests) |
| `art/codex` | Codex image prompt pack |

Contributor and agent rules: [`CLAUDE.md`](CLAUDE.md). Tests: `pnpm test` (unit), `pnpm e2e` (Playwright; never run `playwright install` in this environment).
