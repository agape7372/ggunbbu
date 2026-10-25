# 건뿌 이미지 프롬프트 — 단일 정본 (2026-09-06)

이 파일이 건뿌의 **유일한** 이미지 프롬프트 정본이다. `docs/GROK_IMAGE_PROMPTS.md`,
`assets/ref/geonppu-building-prompts.md`, `docs/ART_DIRECTION.md §3` 셋은 여기로 흡수하고 삭제했다(§7-b).
스타일 정본은 여전히 `docs/ART_DIRECTION.md §1·§2` — 이 파일은 그걸 프롬프트로 번역한 것이다.

## 2026-09-06 제작·적용 결과

**필수 제작과 런타임 배선 완료.** 아래 프롬프트는 제작 사양으로 보존하며, 실제 적용 상태는 이 표를 따른다.

| 항목 | 결과 |
|---|---|
| 플레이어 | `public/img/char/player.png` 506×60, 46×60 셀 11개 |
| 집행기 | `public/img/char/executor-atlas.png` 1536×1024 RGBA 원본, 본체·좌우 집게를 약 270×88로 조립 |
| 엔티티 7종 | `public/img/char/`의 bolt, bolt-cue, rock, shot-ok, shot-no, rabbit, cannon PNG — 슬롯별 최종 치수 적용 |
| 층 시트 4테마 | `public/img/floors/{europe,asia,eastasia,modern}.png` 각 270×340, 68px×5행 |
| 특수 층 | `public/img/floors/special.png` 270×476, 68px×7행. 유리·얼음까지 소비 연결 |
| 2막 배경 | `public/img/bg/act2.png` 360×640 세로로 재생성 |
| 선택 배경 4종 | 기존 360×640 파일 유지. `bg-executor`, `bg-bonus`는 modern 파일 공유 |
| 타이틀·피처 그래픽 | `assets/store/title-kv.png` 360×640, `feature-graphic.png` 1024×500 |
| 실제 게임 캡처 | `assets/store/shot-01..04.png` 375×812 + `shot-01..04-9x16.png` 360×640 |
| 아이콘 | 현재 라인아트로 교체. `assets/store/icon-512.png` 및 PWA 192/512 변형, 불투명 PNG |

- 이미지 생성은 built-in imagegen 사용. 실제 입력·변환 기록은 `assets/ref/image-production-prompts.json`, 원본은 `assets/ref/generated/`에 보관한다.
- 생성기가 요청 치수를 그대로 반환하지 않아 Lanczos로 최종 치수를 맞췄다. 플레이어는 **4×3 원본의 11포즈를 가로로 재배열**했고, 층은 원본의 실제 행 경계를 각각 잘라 68px 높이로 맞췄다. 픽셀 그림을 코드로 새로 그린 것이 아니다.
- 캐릭터·엔티티는 원본 알파와 아이보리 매트 추출 결과를 PNG에 저장했다. 런타임에서 다시 chroma를 적용하지 않는다.
- `refreshFloorSheetAssets()`가 preload 완료 뒤 `floorSheetCache.ts`에 PNG 타일을 설치한다. 폴백 캐시는 `sprites.ts`가 별도로 소유한다. 지붕/입구는 기존 최상층/최하층의 그림만 바꾸고 HP·층수는 유지하며 내구도 눈금을 덧그린다. 유리/얼음은 `GimmickId`로 선택한다. 파일 실패 시 기존 프로시저럴 폴백.
- `fx-hit`·`fx-slash` 고아 키 삭제, BG 메타 높이 640 정정, CSS `image-rendering: auto`, SW 전체 이미지 프리캐시 적용.
- 검증: 23개 테스트 파일의 **159개 테스트 통과**, 타입/프로덕션 빌드 통과. 이미지 19장 2.24MB, dist 2.62MB. 신규 PWA 설치 후 오프라인 재시작과 전 이미지 실패 폴백에서 pageerror 0.
- 확인 자료: `assets/ref/image-qa/`(층·유리·얼음 실화면, 원본 크기 비교표, 브라우저 검사), `assets/store/README.md`(납품 목록).
- 원본 확대에서 미세한 채움 편차는 남을 수 있다. 최종 규격에서 구조·포즈·탄환 실루엣과 노랑 위치를 육안 확인했으며, 모든 픽셀이 지정 HEX와 정확히 같다는 정량 판정은 하지 않았다.

---

## 0. 사용법

- **스키마**: `id` / `filename`(`public/img/` 상대, 스토어는 `assets/store/` 상대) / `consumer`(그 키를 실제로 그리는 `파일:줄`) / `gen_size`(생성기에 넣을 해상도) / `final_size`(레포에 들어갈 해상도) / `cells`(시트 분할 규칙) / `chroma`(투명 키) / `prompt{subject, style, composition, color}` / `negative` / `accept[]`(슬롯 전용 검수 항목) / `notes`.
- `prompt`의 네 칸은 **영어**다. 생성기에 넣을 때는 `subject → style → composition → color` 순으로 이어 붙인다. `accept`·`notes`는 사람이 읽는 칸이라 한국어이고, **생성기에 넣지 않는다**.
- `"style"`·`"negative"` 값이 `@common` 으로 시작하면 §1 `common` JSON의 해당 문자열을 **그 자리에 원문 그대로 펼친 뒤** 나머지를 이어 붙인다는 뜻이다.
- **생성기 무관**. negative 칸이 있는 생성기면 `negative`를 그 칸에 넣고, 없으면 프롬프트 끝에 ` Avoid: ` + `negative` 를 한 줄로 붙인다.
- 생성 요청 하나는 `id` 하나만 다룬다. 나온 파일은 `filename` 경로·이름 그대로 저장한다.
- 이미지 안에 **글자·숫자·라벨·로고를 그리지 않는다.** 고유명(졸라맨 뿌뿌 / 철거 집게보 집행기)은 `notes`에만 적는다. 외부 레퍼런스 인물·작품명도 프롬프트에 넣지 않는다.

## 1. 공통 스타일 블록

`ART_DIRECTION.md §1-2`가 앵커다. **평면성 강제 문장이 이 블록의 핵심**이다 — 08-30 생성분이 폐기된 이유가 정확히 이 문장이 약해서였다(§6).

```json
{
  "id": "common",
  "style": "Minimal line art. Thin, even-weight black ink strokes #1A1A20 with rounded caps, drawn with a slight hand-drawn wobble but never rough or sketchy. Flat warm ivory ground #F4F1E8, completely untextured. Only one accent color exists in this world: yellow #FFD200, and it appears only where the slot explicitly allows it. STRICTLY FLAT: flat vector-like fills, no shading, no ambient occlusion, no gradient, no texture noise, no bevel, no 3D render, no drop shadow, no photoreal. Every filled area is ONE solid value from edge to edge, with no lighting direction and no cast shadow anywhere in the image. Line is the only way depth is described. Remove a line wherever the drawing survives without it. Deadpan and quiet.",
  "negative": "shading, ambient occlusion, soft shadow, cast shadow, drop shadow, gradient, gradient fill, texture noise, grain, paper texture, bevel, emboss, 3D render, volumetric light, photoreal, photograph, cinematic lighting, pixel art, dot art, 16-bit, thick outlines, sketchy hatching, watercolor wash, text, letters, numbers, labels, logo, watermark, signature, UI chrome, HUD, buttons, facial features, eyes, mouth"
}
```

## 2. 파이프라인

1. **생성** — `gen_size` 그대로. 배경·타이틀은 4배가 아니라 지정 배율(2배), 캐릭터·엔티티·층은 4배(또는 슬롯이 지정한 배율).
2. **축소** — `final_size`로. **최근접(nearest) 금지**, 고품질 리샘플(Lanczos/bicubic)을 쓴다. 현재 CSS도 `image-rendering: auto`로 정리했다.
3. **알파 정리** — 캐릭터·엔티티의 원본 알파를 보존하고 아이보리 매트가 남은 픽셀만 RGB 차이 합 48 미만 기준으로 투명화한다. 결과를 PNG에 저장하므로 매니페스트 chroma는 사용하지 않는다. 층 시트는 불투명 풀블리드다.
4. **배치** — `public/img/<filename>`. 스토어 에셋만 `assets/store/`(예산 게이트 밖).
5. **예산** — `npm run check:budget`. 상한: dist 12MB · 이미지 한 장 1.5MB · `public/img` 합계 8MB. 바이트 동일 중복도 여기서 걸린다(`bg-bonus`는 파일 복사가 아니라 `src` 포인터 유지).
6. **검수** — 360×640으로 축소해 놓고 §3 체크리스트. 크게 보면 다 괜찮아 보인다.

### 생성 게이트 순서 (지키지 않으면 안 쓰는 그림이 쌓인다)

| 차수 | 대상 | 통과 조건 |
|---|---|---|
| **1차** | `player` · `boss` · `ent-*` 7 · `bg-act2` 재생성 · **`floors-europe` 1장만** | §3 전항 + 게임에 붙여 360×640 실화면 판정 |
| **2차** | `floors-asia` · `floors-eastasia` · `floors-modern` · `floors-special` | 1차의 `floors-europe`가 `sprites.ts` 소비 배선을 거쳐 **평면성 판정을 통과한 뒤에만** |
| 선택 | `bg-europe/asia/eastasia/modern` 재생성 | 기존 4테마 배경은 규격이 맞다 — 상단 보강이 필요할 때만 |
| 스토어 | 타이틀 KV · 피처 그래픽 · 스크린샷 4장 | Play 제출 전 |

`bg-act2`가 1차 필수였던 이유: 제작 전 파일이 **1536×1024 가로 1.1MB**로 세로 규격을 벗어나 있었다. 현재는 360×640으로 교체 완료했다. moon은 런타임 제외, executor는 modern 별칭이다.

## 3. 검수 체크리스트 (모든 슬롯 공통 accept)

1. **360×640 축소 판독** — 실화면 크기로 줄여 놓고 형태가 읽히는가.
2. **그레이스케일 등급 3단** — 채도를 0으로 만들어도 약/중/강이 창 모양·선 밀도로 구분되는가. 색(hue)으로만 갈리면 불합격.
3. **잉크가 화면에서 제일 어둡다** — 명도 위계 `BG #F4F1E8 > RUBBLE #9A958C > TILE_EDGE #4A4740 > INK #1A1A20`. 어떤 면 채움도 `#1A1A20`보다 밝아야 한다. 그림자·AO가 잉크보다 어두우면 졸라맨이 묻힌다.
4. **노랑 0곳 또는 1곳** — 슬롯이 명시한 자리 말고 `#FFD200`이 한 픽셀도 없어야 한다.
5. **chroma 순도** — chroma 슬롯은 배경이 정확히 `#F4F1E8` 단색(그라데이션·비네트·안티에일리어싱 헤일로 0). 캐릭터·오브젝트 **내부에 아이보리 채움 금지** — 그 자리가 뚫려 구멍이 난다. 집행기처럼 원본 알파를 가진 슬롯은 chroma 없이 알파를 보존한다.
6. **시트 정합** — 셀 등간격, 공통 지면선(공중 포즈 포함), 전 셀 동일 스케일.
7. **텍스트·로고·얼굴 0.**

## 4. 런타임 슬롯 프롬프트

### 4-1. 배경 5종 + 집행기 별칭

논리 캔버스 360×640 세로. 2배(720×1280)로 뽑아 360×640으로 축소한다.

**★런타임 크롭 실측**: 필드 목적지는 360×560(`VIEW.FIELD_TOP 50` ~ `VIEW.FIELD_H 610`)이고 `drawBackdrop`가 cover + 하단 고정으로 그린다(`src/render/assets.ts:177-211`). 그래서 360×640 원본의 **상단 80px(12.5%)은 화면에 절대 안 나온다.** 중요한 요소를 거기 두지 말 것.

**★레인 비움**: 건물은 `LANE_X 180` 중심 `LANE_W 270` → 화면 x **45~315**를 낙하물이 차지한다. QA E-1(상단이 텅 빔) 대응으로 상단을 옅게 채우되, 추가 요소는 좌우 바깥 띠(360 기준 x<45 또는 x>315, 생성 720 기준 x<90 또는 x>630)에 두거나 면을 만들지 않는 헤어라인 한 줄로만 가로지른다.

#### bg-europe
```json
{
  "id": "bg-europe", "filename": "bg/europe.png", "consumer": "src/render/background.ts:22 (drawChapterBackdrop → assets.ts:177 drawBackdrop), key from background.ts:15-20",
  "gen_size": "720x1280", "final_size": "360x640", "cells": "none", "chroma": null,
  "prompt": {
    "subject": "A distant European stone skyline: limestone rooftops of slightly different but all modest heights, low cornices, one broken pediment, two or three arched window holes as simple arched lines, a colonnade suggested by three vertical strokes, a water tank, a stub antenna. Drawn as one continuous thin pen contour with NO fill anywhere. Higher up and far to one side, a single bell-tower or spire silhouette rises above the rest as an unfilled hairline that thins toward its tip; one or two extremely faint horizontal cloud-line strokes drift in the upper band.",
    "style": "@common Outlines only, zero fill on the skyline. This background must disappear behind gameplay; if it draws attention it is wrong.",
    "composition": "Vertical 720x1280 portrait. The skyline occupies ONLY the bottom 15 percent of the frame. The remaining 85 percent is nearly empty ivory. Every added upper mark sits in the outer left or right eighth of the width (x below 90 or above 630) and never forms a filled shape across the middle column. Nothing important in the top 160 pixels.",
    "color": "Ivory #F4F1E8 field, ink #1A1A20 lines only. Zero yellow. Zero other hues. No navy, no dusk gradient."
  },
  "negative": "@common characters, crowds, cars, dense clouds, sun, stars, birds flock, navy sky, saturated building colors, filled skyline, skyscrapers, perspective streets, busy sky, marks in the center lane column",
  "accept": ["상단 80px에 아무것도 없다(런타임 크롭)", "x 45~315 세로 띠에 면을 만드는 요소 0", "스카이라인 채움 0 — 윤곽선만"],
  "notes": "1막 챕터0 서쪽 회랑. 현행 public/img/bg/europe.png 는 이미 360×640 135KB로 규격 정합 — 상단 보강이 필요할 때만 재생성한다."
}
```

#### bg-asia
```json
{
  "id": "bg-asia", "filename": "bg/asia.png", "consumer": "src/render/background.ts:22, key from background.ts:16 (ACT1.CHAPTER_THEMES[1])",
  "gen_size": "720x1280", "final_size": "360x640", "cells": "none", "chroma": null,
  "prompt": {
    "subject": "A distant West and South Asian market skyline: low flat stall roofs, a few lattice window grids as tiny hash marks, a scaffold of two or three verticals, a market awning as one triangle stroke, a crooked chimney, one rectangular windcatcher tower with slotted top, one modest hemispherical dome read as a BUILDING and not a monument. One continuous thin pen contour, NO fill. Higher up and far to one side, one or two tiny kite silhouettes as a small diamond outline on a thin string line, and a couple of very small bird-V hairlines even higher.",
    "style": "@common Outlines only, zero fill. Emptiness is ivory, never haze — no fog wash, no mist. This background must disappear behind gameplay.",
    "composition": "Vertical 720x1280 portrait. Skyline ONLY in the bottom 15 percent. The rest is nearly empty ivory, with the few added marks confined to the outer left or right eighth (x below 90 or above 630). Nothing important in the top 160 pixels.",
    "color": "Ivory #F4F1E8 field, ink #1A1A20 lines only. Zero yellow. No blue water, no saturated market color, no navy."
  },
  "negative": "@common characters, crowds, signage, monuments, statues, fog wash, mist, blue water, ripples, navy sky, saturated market colors, dense kites, busy sky, marks in the center lane column",
  "accept": ["상단 80px 비움", "연·새는 좌우 바깥 띠에만", "물·안개 채움 0"],
  "notes": "1막 챕터1 강턱 시장. 돔·바람탑은 건물이지 기념물이 아니다 — 실루엣이 랜드마크로 읽히면 폐기."
}
```

#### bg-eastasia
```json
{
  "id": "bg-eastasia", "filename": "bg/eastasia.png", "consumer": "src/render/background.ts:22, key from background.ts:16 (ACT1.CHAPTER_THEMES[2])",
  "gen_size": "720x1280", "final_size": "360x640", "cells": "none", "chroma": null,
  "prompt": {
    "subject": "A distant East Asian tiled-roof skyline: wooden houses with gently curved eaves, overlapping roof waves as a few scalloped strokes, a chimney, a stone lantern as two tiny stacked rectangles, a bare flagpole, paper-screen windows as small square frames with no glow. Roofs step like a low hill, never a mountain. One continuous thin pen contour, NO fill. Higher up, one faint single-contour distant ridge line crossing quietly behind, and one or two very thin horizontal cloud strokes above it.",
    "style": "@common Outlines only, zero fill. The ridge line is a single hairline, not a filled hill. This background must disappear behind gameplay.",
    "composition": "Vertical 720x1280 portrait. Skyline ONLY in the bottom 15 percent. The ridge hairline may cross the width because it is a single unfilled line, but every other added mark stays in the outer left or right eighth. Nothing important in the top 160 pixels.",
    "color": "Ivory #F4F1E8 field, ink #1A1A20 lines only. Zero yellow. No vermilion, no painted eave color, no saturated wood brown, no navy."
  },
  "negative": "@common characters, cherry blossoms, calligraphy, dragons, moon, filled hill, vermilion, dancheong paint, saturated wood, navy sky, busy sky, marks in the center lane column",
  "accept": ["능선은 채움 없는 한 줄", "달 없음 — 집행기 세계관", "단청·원색 0"],
  "notes": "1막 챕터2 기와능선."
}
```

#### bg-modern
```json
{
  "id": "bg-modern", "filename": "bg/modern.png", "consumer": "src/render/background.ts:22, key from background.ts:16 (ACT1.CHAPTER_THEMES[3]) — bg-bonus도 같은 파일을 가리킨다",
  "gen_size": "720x1280", "final_size": "360x640", "cells": "none", "chroma": null,
  "prompt": {
    "subject": "A distant modern skyline: unfinished concrete slab rectangles, a few curtain-wall grid fragments as tiny window ticks, diagonal rebar X-braces on one ruin, a cylindrical water tank on stilts, a cubic HVAC unit, an elevator overrun, rivet dots as the smallest circles. One continuous thin pen contour, NO fill. Higher up and to one side, a single construction-crane jib as one long hairline with a small hook tick, plus one or two faint distant tower stubs as short unfilled rectangles with no windows drawn on them.",
    "style": "@common Outlines only, zero fill. Glass is line, never cyan, never reflection, never shine. This background must disappear behind gameplay.",
    "composition": "Vertical 720x1280 portrait. Skyline ONLY in the bottom 15 percent. The crane jib and tower stubs sit in the outer left or right eighth (x below 90 or above 630). Nothing important in the top 160 pixels.",
    "color": "Ivory #F4F1E8 field, ink #1A1A20 lines only. Zero yellow. No ocean fill, no waves, no blue, no cyan glass, no rust orange, no navy."
  },
  "negative": "@common characters, cars, aircraft, cyan glass, reflections, lens flare, ocean fill, waves, rust orange, navy sky, filled crane, busy sky, marks in the center lane column",
  "accept": ["크레인은 갈고리 틱 하나 달린 헤어라인", "타워 스텁에 창 그리지 않음", "청록·반사 0"],
  "notes": "1막 챕터3 무너진 신도시 + 특별작전 유리 골목/철근 해안 공용. bg-bonus가 이 파일을 재사용한다 — 복사본을 만들면 check-budget 바이트 중복 검사에 걸린다."
}
```

#### bg-act2
```json
{
  "id": "bg-act2", "filename": "bg/act2.png", "consumer": "src/render/background.ts:15 (mode==='act2' && phase!=='moon') → :22",
  "gen_size": "720x1280", "final_size": "360x640", "cells": "none", "chroma": null,
  "prompt": {
    "subject": "A ruined cathedral-and-skyscraper horizon seen from far away: broken columns, a shattered rose-window circle drawn as a bare ring with two or three missing wedge lines, sheared floor plates, a few exposed rebar ticks, and beside them the stripped frames of two tall towers. One continuous thin pen contour, NO fill. Rising from that ruin, ONE tall broken spire continues noticeably higher into the frame than everything else, an unfilled line getting thinner toward its jagged top. A few sparse dust-mote ink flecks drift near it.",
    "style": "@common Outlines only, zero fill. Ruin is described by missing lines, not by rubble texture. This background must disappear behind gameplay.",
    "composition": "Vertical 720x1280 portrait. The ruin horizon occupies ONLY the bottom 15 percent. The tall spire is placed off-center in the outer left or right eighth so it never crosses the middle column. Nothing important in the top 160 pixels.",
    "color": "The sky is a slightly duskier ivory, approximately #EBE6DC, still unmistakably in the ivory family. Ink #1A1A20 lines only. Zero yellow. Never dark, never navy, never black."
  },
  "negative": "@common characters, moon, stars, navy sky, black sky, dense rubble texture, smoke clouds, fire, busy sky, marks in the center lane column",
  "accept": ["황혼은 #EBE6DC 수준 — 어두워지면 불합격", "달 없음 — 집행기 세계관", "첨탑이 중앙 열을 안 지난다"],
  "notes": "09-06: 가로 구본을 360×640 세로 PNG로 재생성 완료. 2막 페이즈(대성당→탑)를 한 장이 겸한다."
}
```

#### bg-executor (별칭 — 프롬프트 없음)

최종 집행기 대치 무대. 매니페스트의 `bg-executor`는 `bg/modern.png`(360×640)를 재사용한다.
기존 `bg/moon.png`는 큰 달이 그려져 있어 런타임에서 제외하고 `assets/ref/legacy-moon-background.png`로 보관했다.
`act2Phase='moon'`은 저장·미션 호환용 내부 ID이며 화면에는 집행기만 표시한다.
케이블은 `src/render/executor.ts`가 화면 위에서 본체까지 매 프레임 그린다.

#### bg-bonus (별칭 — 프롬프트 없음)

`bg-bonus`는 매니페스트에서 `bg/modern.png`를 가리키는 **별칭**이다. 별도 파일을 만들지 않는다 — `check-budget`의 바이트 동일 중복 검사가 바로 잡는다. 버터 라운드 전용 배경을 정말 만들 거라면 그때 신규 슬롯으로 승격하고 이 절에 프롬프트를 추가한다. 지금은 `src` 포인터 유지가 정답이다.

### 4-2. 플레이어 시트

#### player
```json
{
  "id": "player",
  "filename": "char/player.png",
  "consumer": "src/render/sprites.ts drawPlayer (playerPngKey → drawAsset(ctx,'player',…,sheet)) · drawHat (SHEET_HEAD 머리 좌표), 프레임 인덱스 = src/render/frames.ts playerSheetFrame",
  "gen_size": "2024x240 (4배)",
  "final_size": "506x60",
  "cells": "가로 11칸, 셀 46x60, 기준점 = 발(anchor foot). 순서는 frames.ts PLAYER_SHEET 배열 그대로",
  "chroma": null,
  "prompt": {
    "subject": "A character sprite sheet of a faceless stickman for a game engine — a literal frame strip, not a poster. Plain circle head with NO face at all: no eyes, no mouth, nothing. Single-line torso, single-line limbs with simple joint bends. A thin blade drawn as one straight line with a tiny circle for the grip. ELEVEN poses in this exact left-to-right order: 1 IDLE standing upright, feet slightly apart, blade hanging straight down at his side. 2 JUMP airborne, both knees tucked toward the torso, blade trailing behind at hip height. 3 ATTACK WIND-UP torso leaning back slightly, sword arm raised so the blade points up past his head, off-hand out for balance, no trail yet. 4 ATTACK HIT deep forward lunge, front knee bent, back leg fully extended, blade swept low and through at front-leg height, with a single sweeping yellow #FFD200 arc trailing from the blade tip. 5 ATTACK RECOVERY the same deep lunge held, blade fully lowered at the end of its swing, no trail, stillness. 6 GUARD GROUND standing planted, both arms spread outward and up so they do NOT cross the head circle, blade held perfectly horizontal above the head. 7 GUARD AIR airborne with knees tucked sharper and higher than the JUMP pose so the silhouette is visibly different, same horizontal-blade-overhead guard. 8 GUARD BREAK head and torso tipped backward off balance, one leg forward one back, both arms flung wide open, blade tipping loosely behind as if about to slip from his grip. 9 SPECIAL the deepest two-handed lunge of the set, both hands together low on the grip, blade swept far past his leg, with ONE large diagonal yellow #FFD200 slash crossing corner to corner of the cell — bigger than cell 4's arc but the exact same ink weight and hue. 10 PINNED squashed low, body compressed into a low horizontal line, limbs splayed sideways symmetrically, head compressed near the top of the flattened silhouette. 11 DEAD reclining diagonally on his back, head tilted to one side, limbs limp and asymmetric, a silhouette clearly different from PINNED even in solid black.",
    "style": "@common No clothing, no hair, no equipment beyond the single blade.",
    "composition": "One horizontal row of eleven equal cells, side view facing RIGHT, ALL AT IDENTICAL SCALE ON ONE SHARED GROUND LINE drawn as a single continuous hairline running under EVERY cell including the airborne ones. Evenly spaced, each figure small inside its cell with clear empty ivory margin. No numbers, no labels, no dividers between cells.",
    "color": "Ivory #F4F1E8 ground that is one exact flat value everywhere, ink #1A1A20 figure. Yellow #FFD200 appears in exactly two cells, 4 and 9, and nowhere else. No cyan, no red, no ivory-colored highlight inside the figure."
  },
  "negative": "@common clothing, hair, equipment, different scale per pose, different ground heights, missing ground line under airborne poses, dividers, cell borders, cyan, red fill, third yellow location, ivory highlights inside the figure, background color other than flat #F4F1E8",
  "accept": [
    "11칸 순서 = idle/jump/attack0/attack1/attack2/guardG/guardA/guardBreak/special/pinned/dead",
    "공중 3칸(jump·guardA·guardBreak)도 같은 지면선 위에 뜬 상태",
    "jump와 guardA 실루엣이 서로 다르다",
    "pinned와 dead가 검은 실루엣만으로 구분된다",
    "노랑은 4번·9번 두 칸뿐"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. ★셀 순서를 바꾸면 게임이 엉뚱한 포즈를 보여준다 — frames.ts:8-20 PLAYER_SHEET가 정본. 필살(9번)에 노랑을 넣는 건 sprites.ts buildSpecial()이 실제로 대각선 노란 참격을 그리기 때문이다. 비기본 코스메틱 장착 시엔 PNG 대신 프로시저럴이 이긴다(sprites.ts playerPngKey) — 이 시트는 기본 룩 + 철거칼 전용이다. ★10-25: 칼 그림이 박혀 있어 다른 무기는 아래 `player-<무기>` 시트가 맡는다. 안전모가 이 시트의 머리 좌표표(`SHEET_HEAD`, 알파 실측)를 쓰므로 다시 만들면 표도 다시 잰다."
}
```

#### player-hammer · player-crowbar · player-grinder (10-25 신설 — 미제작)

무기만 다른 `player` 시트 셋. 파일이 생기면 `sprites.ts` `playerPngKey()`가 바로 집는다. **매니페스트 항목은 파일과 같이 넣는다**(파일 없는 키 금지) — `player`와 같은 `frames`·`anchor`.

```json
{
  "id": "player-<weapon>",
  "filename": "char/player-<weapon>.png",
  "consumer": "src/render/sprites.ts drawPlayer (playerPngKey = 'player-' + s.weapon) · drawHat (SHEET_HEAD를 player와 같이 쓴다)",
  "gen_size": "2024x240 (4배)",
  "final_size": "506x60",
  "cells": "player와 같다 — 가로 11칸, 셀 46x60, 발 기준점, 순서 = frames.ts PLAYER_SHEET",
  "chroma": null,
  "prompt": "player 슬롯 prompt를 그대로 쓰고, subject의 블레이드 문장만 아래 무기 문장으로 바꾼다. 포즈·머리 위치·크기·지면선은 player.png와 같게.",
  "weapon": {
    "hammer": "A sledgehammer instead of the blade: a straight thin handle about as long as the blade, ending in a WIDE, THIN rectangular iron head set crosswise like a letter T. Iron head filled flat #948E82 with the same ink outline. The head must be clearly wider than it is thick so it never reads as a box or a bag.",
    "crowbar": "A crowbar instead of the blade: one straight ink line about 1.3 times the blade length, extending a little behind the grip, ending in a small curled claw hook. No fill.",
    "grinder": "An angle grinder instead of the blade: a short thick body line held in the hand, a tiny side handle sticking out of it, and a round cutting disc at the front end filled flat #E2DED3 with an ink outline and a dot at its center."
  },
  "negative": "player 슬롯 negative + 칼날을 그대로 둔 채 무기를 하나 더 그린 것, 무기에 노랑, 머리 위치가 player.png와 다른 칸",
  "accept": [
    "player.png 위에 반투명으로 겹치면 11칸 모두 머리 원이 같은 자리",
    "36px 높이로 줄여도 무기 넷이 실루엣만으로 갈린다",
    "노랑은 4번·9번 참격 두 칸뿐"
  ],
  "notes": "10-25: 지금은 철거칼만 PNG라 무기를 바꾸면 졸라맨이 선 그림 폴백(선이 굵고 키가 큼)으로 바뀐다. 이 시트 셋이 들어오면 사라진다. 선 그림 무기 모양 = sprites.ts weapon()."
}
```

### 4-3. 집행기 부품 아틀라스 (적용 완료)

#### boss
```json
{
  "id": "boss",
  "filename": "char/executor-atlas.png",
  "consumer": "src/render/executor.ts — img('boss') 후 부품별 drawImage; sprites.ts drawBoss에서 호출",
  "gen_size": "1536x1024",
  "final_size": "1536x1024 원본 알파 보존, 런타임 조립 외형 약 270x88",
  "cells": "가로 4상태 시트가 아닌 본체/좌집게/우집게 부품 아틀라스. source rect: [46,149,1444,180] / [333,479,214,377] / [989,479,214,377]",
  "chroma": null,
  "prompt": {
    "subject": "One broad shallow demolition crossbeam and two detached mirror-image L-shaped jaws, front orthographic view. Three isolated parts only. The beam has two panel seams and one EMPTY round indicator socket. No attached cables.",
    "style": "Minimal flat line illustration, thin uniform ink #1A1A20, solid dusty grey #AEB0B2, genuine transparent alpha background. No shading or texture.",
    "composition": "1536x1024 atlas. One wide beam across the upper half. A left jaw and mirrored right jaw separated in the lower half. Large transparent gaps, no text or dividers.",
    "color": "Neutral grey and ink only. No yellow in the source; the game draws the yellow operation light and switches it off on defeat."
  },
  "negative": "moon, craters, face, text, numbers, windows, perspective, cables, shadows, glow, bevels, texture, hazard stripes, yellow, blue, red, opaque background",
  "accept": [
    "건물과 같은 전체 폭 270, 본체 250x44, 짧은 집게 2개",
    "알파 투명 유지 — chroma 처리 없음",
    "본체/양집게 독립 구동, 케이블은 코드",
    "격파 시 노랑 0, 오른쪽 집게 처짐과 패널 이음새 벌어짐",
    "모바일 375x812 실화면에서 판독 확인"
  ],
  "notes": "집행기. 2026-09-06 built-in imagegen 생성. 전체 실제 입력은 assets/ref/executor-generation-prompt.txt. 렌더 좌표/부품 각도는 executor.ts; HIT_REACH=64는 외형 H=88과 분리. 180틱 등장 소품 층은 피격/콤보 없는 연출 전용. HP230·티어50/150·패턴 타이밍은 유지."
}
```

### 4-4. 엔티티 7종

전부 4배 생성 → 실치수 축소 → chroma `#F4F1E8`. `ent-shotOk`/`ent-shotNo`는 **색이 아니라 모양**으로 갈린다(색약 안전 규칙).

#### ent-bolt
```json
{
  "id": "ent-bolt",
  "filename": "char/bolt.png",
  "consumer": "src/render/sprites.ts:771 (drawBoltEntity), 키 조립 = frames.ts:53 entityAssetKey",
  "gen_size": "48x160 (4배)",
  "final_size": "12x40",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "A single falling lightning bolt drawn as ONE continuous jagged zigzag ink line with sharp angular turns and no curves. It reads as a hairpin line shape, not as a solid filled lightning-bolt icon. No glow, no motion blur, no spark burst around it — just the bare zigzag.",
    "style": "@common",
    "composition": "Tall narrow frame, the zigzag filling most of the height with a small ivory margin top and bottom, centered.",
    "color": "Ivory #F4F1E8 ground, ink #1A1A20 stroke only. Zero yellow, zero cyan, zero fill inside the zigzag."
  },
  "negative": "@common yellow fill, cyan, glow, motion blur, filled lightning icon, rounded curves, second color",
  "accept": [
    "12×40에서도 지그재그로 읽힌다",
    "채움 0 — 선만"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. 2막 낙뢰. 구 코드의 청록 #29E0E6은 현 팔레트에 없는 색이라 폐기 — 순수 잉크 선."
}
```

#### ent-boltCue
```json
{
  "id": "ent-boltCue",
  "filename": "char/bolt-cue.png",
  "consumer": "src/render/sprites.ts:765 (drawBoltEntity, cueTicks>0 분기)",
  "gen_size": "48x48 (4배)",
  "final_size": "12x12",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "A tiny warning glyph: a miniature version of the same jagged lightning zigzag, one continuous angular ink line with no fill. It must read as an unmistakable 'something is about to fall here' mark. Keep the zigzag bold in SHAPE even though the stroke stays thin. No ring around it, no exclamation mark, no burst rays.",
    "style": "@common",
    "composition": "Square frame, the glyph small and centered with generous ivory margin.",
    "color": "Ivory #F4F1E8 ground, ink #1A1A20 stroke only. Zero yellow, zero cyan."
  },
  "negative": "@common yellow fill, cyan, glow, burst rays, ring, exclamation mark, filled icon",
  "accept": [
    "12×12에서 판독",
    "ent-bolt와 같은 어휘(축소판)"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. 레인 위 낙하 예고. 대포 조준 예고도 이 에셋을 재사용하므로 번개 전용 기호로 과하게 특화하지 말 것."
}
```

#### ent-rock
```json
{
  "id": "ent-rock",
  "filename": "char/rock.png",
  "consumer": "src/render/sprites.ts:779 (drawRockEntity) · :967 (drawGroundRocks 바닥 더미)",
  "gen_size": "96x80 (4배)",
  "final_size": "24x20",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "A single loose chunk of falling rubble: an irregular jagged-edged block, NOT a rectangle, outlined in thin ink and filled with one flat dusty grey-brown value. One thin crack hairline runs across the face. This is debris, not a character — no eyes, no face, no comic expression.",
    "style": "@common One flat fill value, no second tone inside the block.",
    "composition": "Wide-ish squat proportions, centered with generous ivory margin. No dust cloud, no motion lines.",
    "color": "Ivory #F4F1E8 ground, ink #1A1A20 outline, one flat fill from the desaturated dust family (#9A958C or nearby). Zero yellow. The fill must stay clearly brighter than the ink."
  },
  "negative": "@common face, eyes, comic expression, rectangle shape, saturated color, dust cloud, motion lines, second fill value",
  "accept": [
    "24×20 판독",
    "채움이 잉크보다 밝다",
    "얼굴 0"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. 이 에셋 하나가 낙석과 바닥 더미 두 곳에 쓰인다 — 바닥 더미는 12px 간격으로 겹쳐 쌓이니(sprites.ts:965) 실루엣 윤곽이 겹쳐도 읽혀야 한다. 구 프로시저럴 buildRockIcon()은 눈 2개를 그렸지만 무표정 원칙상 제거."
}
```

#### ent-shotOk
```json
{
  "id": "ent-shotOk",
  "filename": "char/shot-ok.png",
  "consumer": "src/render/sprites.ts:786-787 (drawShotEntity, e.cancellable=true)",
  "gen_size": "64x40 (4배)",
  "final_size": "16x10",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "A small guardable projectile: a HOLLOW ring drawn as a thin ink circle outline with an empty ivory centre and no fill inside, plus a short simple line tail trailing from one side to suggest motion. The open hollow silhouette is the entire signal that this one is safe to guard.",
    "style": "@common",
    "composition": "Wide-short frame, centered, tail pointing left, generous ivory margin.",
    "color": "Ivory #F4F1E8 ground, ink #1A1A20 stroke only. Zero yellow, zero cyan, zero red — no colour coding of any kind."
  },
  "negative": "@common filled circle, spikes, yellow, cyan, red, colour-only distinction, glow",
  "accept": [
    "16×10에서 ent-shotNo와 실루엣이 확실히 다르다",
    "고리 속이 뚫려 있다(아이보리 = chroma로 투명해짐)"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. ★고리 안쪽이 #F4F1E8이라 chroma에서 뚫린다 — 그게 의도다. 뒤 배경이 비치는 게 맞다."
}
```

#### ent-shotNo
```json
{
  "id": "ent-shotNo",
  "filename": "char/shot-no.png",
  "consumer": "src/render/sprites.ts:786-787 (drawShotEntity, e.cancellable=false)",
  "gen_size": "64x40 (4배)",
  "final_size": "16x10",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "A small unguardable projectile that must be dodged: a SOLID filled ink circle with a few short spike ticks radiating from its rim, making the silhouette visibly spikier and denser than a plain circle, plus a short line tail trailing from one side. The danger signal is shape density alone — solid and spiky — never colour.",
    "style": "@common The fill is flat ink, one value, no highlight.",
    "composition": "Wide-short frame, centered, tail pointing left, generous ivory margin.",
    "color": "Ivory #F4F1E8 ground, flat ink #1A1A20 fill. Zero yellow, zero cyan, zero red."
  },
  "negative": "@common hollow ring, yellow, cyan, red, colour-only distinction, smooth circle without spikes, ivory highlight inside the circle",
  "accept": [
    "16×10에서 ent-shotOk와 실루엣이 확실히 다르다",
    "원 안에 아이보리 하이라이트 0(구멍이 뚫린다)"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. 가드 불가·회피 전용. 색약 안전 짝(ent-shotOk 속 빈 고리 ↔ 이쪽 속 찬 원+가시)."
}
```

#### ent-rabbit
```json
{
  "id": "ent-rabbit",
  "filename": "char/rabbit.png",
  "consumer": "src/render/sprites.ts:801 (좌향, 반전 그리기) · :802 (우향) — drawRabbitEntity",
  "gen_size": "112x80 (4배)",
  "final_size": "28x20",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "A small scout DRONE — a machine, not an animal. A compact rectangular body block outlined in thin ink and filled with one flat dusty grey-brown value. Two short straight HORIZONTAL rotor-arm ticks project from the upper left and right corners, lying flat and low so they read as mechanical rotor stubs and absolutely not as upright ears. One small round lens on the underside of the body, filled solid yellow #FFD200, echoing the execution machine's yellow operation light. No face, no fur, no whiskers, no soft rounded animal head, no long ears, nothing cute.",
    "style": "@common",
    "composition": "Wide-short proportions, centered, generous ivory margin. Drawn facing RIGHT — the renderer mirrors it horizontally for the left-moving variant, so the silhouette must survive being flipped.",
    "color": "Ivory #F4F1E8 ground, ink #1A1A20 outline, one flat dusty fill. Yellow #FFD200 only on the single lens. Zero red, zero cyan."
  },
  "negative": "@common rabbit, bunny, animal, fur, whiskers, long upright ears, cute face, eyes besides the one lens, red, cyan, second yellow",
  "accept": [
    "28×20에서 기계로 읽힌다",
    "좌우 반전해도 자연스럽다",
    "노랑은 렌즈 한 곳"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. ★매니페스트 키 이름은 rabbit이지만 실제로는 정찰 드론이다(프로시저럴 buildRabbitIcon도 드론 몸통+프로펠러). 토끼 금지, 안테나를 귀처럼 세우지 않는다. 원작 달토끼 도상 회피의 핵심 슬롯."
}
```

#### ent-cannon
```json
{
  "id": "ent-cannon",
  "filename": "char/cannon.png",
  "consumer": "src/render/sprites.ts:810 (drawCannonEntity, 화면 상단 고정)",
  "gen_size": "96x112 (4배)",
  "final_size": "24x28",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "A small fixed turret mounted at the top of the field, aiming straight DOWN. A wide low mount base and a narrower straight barrel descending from its centre, both drawn as thin ink outlines filled with one flat dusty grey-brown value. Inert hardware — no face, no crosshair, no muzzle flash, no scaffolding around it.",
    "style": "@common",
    "composition": "Tall-ish frame, centered, generous ivory margin. The barrel points toward the BOTTOM of the frame.",
    "color": "Ivory #F4F1E8 ground, ink #1A1A20 outline, one flat dusty fill. Zero yellow, zero red, zero rust orange."
  },
  "negative": "@common face, crosshair, muzzle flash, yellow, red, rust orange, saturated colour, barrel pointing up",
  "accept": [
    "24×28 판독",
    "포신이 아래를 향한다",
    "노랑 0 — 조준 예고는 ent-boltCue가 따로 그린다"
  ],
  "notes": "09-06 제작: 원본 알파와 아이보리 매트 추출을 파일에 반영해 런타임 chroma 없이 소비한다. 특별작전 고정 포탑. 화면 상단 y=20 고정이라 지면 변환과 무관하게 그려진다."
}
```

### 4-5. 층 시트 4테마

**규격 고정**: 810×1020 생성 → **270×340 축소(정확히 ×3)**. 행 5개 각 810×204 → 270×68 = `VIEW.LANE_W 270` × `VIEW.FLOOR_H 68`.

**행 순서 고정**: 1 weak(HP1) / 2 mid(HP2) / 3 hard(HP3) / 4 roof cap(지붕) / 5 ground entrance(1층 입구). 4·5행은 장식이라 HP를 갖지 않는다 — 스택 최상단/최하단에만 놓이고 규칙상 HP는 인접 층을 상속한다. 그래서 4·5행 채움은 그 테마의 **mid 값**을 쓴다(등급을 암시하면 안 된다).

**등급 부호화**: 창 모양 · 선 밀도 · 채움 명도 3단. **색상(hue)으로 구분 금지** — 그레이스케일에서 갈려야 한다.

**풀블리드**: 행 안에 여백·지면선·마진이 0이다. 슬래브가 프레임을 꽉 채우고 좌우로 seamless하게 이어진다. 그래서 이 시트에는 **chroma를 걸지 않는다** — 아이보리 픽셀이 한 점도 없어야 하고, 만약 있으면 그 자리가 투명하게 뚫려 타일에 구멍이 난다.

#### floors-europe
```json
{
  "id": "floors-europe",
  "filename": "floors/europe.png",
  "consumer": "src/render/floorSheetCache.ts refreshFloorSheetAssets -> sprites.ts drawStack (floorSheets.ts floorImageKey)",
  "gen_size": "810x1020",
  "final_size": "270x340",
  "cells": "세로 5행, 각 810x204 → 270x68. 위에서부터 weak / mid / hard / roof cap / ground entrance",
  "chroma": null,
  "prompt": {
    "subject": "Five European building-floor slabs stacked vertically in one sheet, straight-on with zero perspective, same width, same line weight. ROW 1 WEAK: plain plaster facade, exactly two square windows as simple thin-line rectangles, no other detail. ROW 2 MID: the same facade with evenly spaced horizontal brick joint lines and four arched-top windows. ROW 3 HARD: a dense grid of stone joint lines and six narrow vertical slit windows like embrasures. ROW 4 ROOF CAP: a zinc mansard roof with three dormers and two chimney pots sitting above a short stretch of wall, the whole roof fitting inside the row height. ROW 5 GROUND ENTRANCE: two panelled doors reached by a few short step lines, one square window flanking each side, and a single stringcourse band along the top.",
    "style": "@common Every fill is one flat value with no joint shading, no recess shadow, no window glow and no per-brick tonal variation. Joints and bricks are LINES, never separately tinted blocks.",
    "composition": "810x1020 with five slabs of 810x204 stacked with NO gaps, NO margins and NO ground line anywhere. Full bleed: the slabs run edge to edge and each row tiles seamlessly left to right, so the left and right edges of a row must match up when repeated. Windows and doors sit fully inside their own row and never cross a row boundary.",
    "color": "Ink #1A1A20 outlines. Fills #C9C2B4 for row 1, #BCAA9C for row 2, #ABA69E for row 3, and #BCAA9C again for rows 4 and 5. These values are close on purpose: the rows must be told apart by window shape and line density in pure greyscale, never by hue. Zero yellow. Zero ivory #F4F1E8 anywhere in the sheet. Every fill stays clearly brighter than the ink."
  },
  "negative": "@common per-brick tonal variation, individually tinted bricks, recess shadow, window glow, roof shadow on the wall, ground line, ivory margin, gaps between slabs, saturated reds blues yellows, perspective, statues, different hue per row, rounded slab corners",
  "accept": [
    "행 5개가 정확히 204px 등간격, 여백·지면선 0",
    "채도 0으로 만들어도 1·2·3행이 창 모양과 선 밀도로 갈린다",
    "좌우 끝을 이어 붙여도 이음매가 안 보인다",
    "벽돌·줄눈이 개별 색조를 갖지 않는다(선만)",
    "시트 전체에 #F4F1E8 픽셀 0",
    "지붕이 4행 높이 안에 완전히 들어간다"
  ],
  "notes": "★1차 게이트 — 층 시트는 이 한 장만 먼저 뽑는다. 소비 배선(sprites.ts tileCache) 후 실화면 평면성 판정을 통과해야 나머지 3테마+특수 시트로 넘어간다. 채움값은 sprites.ts:99-103 THEME_TIERS.europe 의 base와 일치시킨 것이다."
}
```

#### floors-asia
```json
{
  "id": "floors-asia",
  "filename": "floors/asia.png",
  "consumer": "src/render/floorSheetCache.ts refreshFloorSheetAssets -> sprites.ts drawStack (floorSheets.ts floorImageKey)",
  "gen_size": "810x1020",
  "final_size": "270x340",
  "cells": "세로 5행, 각 810x204 → 270x68. weak / mid / hard / roof cap / ground entrance",
  "chroma": null,
  "prompt": {
    "subject": "Five West and South Asian building-floor slabs stacked vertically in one sheet, straight-on with zero perspective. ROW 1 WEAK: a plain mudbrick wall with two small square windows and a single row of protruding joist-end ticks along the top. ROW 2 MID: the same wall with evenly spaced horizontal courses and four projecting mashrabiya lattice bays drawn as dense thin-line grids. ROW 3 HARD: a dense sandstone joint grid with a pointed-arch arcade of six narrow openings on slim piers, like a caravanserai wall. ROW 4 ROOF CAP: a flat roof with a low parapet, one modest hemispherical dome and one square windcatcher shaft with a slotted vent cap, the whole cap fitting inside the row height. ROW 5 GROUND ENTRANCE: three pointed-arch portals with a low bench line running between them.",
    "style": "@common Every fill is one flat value with no joint shading, no recess shadow inside the arches and no per-brick tonal variation. Courses and lattices are LINES, never separately tinted blocks. The dome is a line contour, not a shaded hemisphere.",
    "composition": "810x1020 with five slabs of 810x204 stacked with NO gaps, NO margins and NO ground line anywhere. Full bleed edge to edge, each row tiling seamlessly left to right. Arches and openings sit fully inside their own row.",
    "color": "Ink #1A1A20 outlines. Fills #C6BCA8 for row 1, #B7A68F for row 2, #A29B8E for row 3, and #B7A68F again for rows 4 and 5. Values are deliberately close: rows must be told apart by opening shape and line density in pure greyscale, never by hue. Zero yellow. Zero ivory #F4F1E8 anywhere in the sheet."
  },
  "negative": "@common shaded dome, recess shadow inside arches, per-brick tonal variation, ground line, ivory margin, gaps between slabs, monuments, statues, sphinx, mausoleum-as-hero, saturated colour, perspective, different hue per row",
  "accept": [
    "행 5개 204px 등간격, 여백 0",
    "그레이스케일 3단 구분",
    "돔이 음영 없는 윤곽선",
    "좌우 seamless",
    "#F4F1E8 픽셀 0"
  ],
  "notes": "2차. 채움값 = sprites.ts:104-108 THEME_TIERS.asia base. 어휘는 마슈라비야·바람탑·첨두아치·흙벽 계열(서남아시아 읽기) — sprites.ts 주석의 '사암 아치+돔 문양'과 정합한다. 기념물 실루엣이 되면 폐기."
}
```

#### floors-eastasia
```json
{
  "id": "floors-eastasia",
  "filename": "floors/eastasia.png",
  "consumer": "src/render/floorSheetCache.ts refreshFloorSheetAssets -> sprites.ts drawStack (floorSheets.ts floorImageKey)",
  "gen_size": "810x1020",
  "final_size": "270x340",
  "cells": "세로 5행, 각 810x204 → 270x68. weak / mid / hard / roof cap / ground entrance",
  "chroma": null,
  "prompt": {
    "subject": "Five East Asian building-floor slabs stacked vertically in one sheet, straight-on with zero perspective. ROW 1 WEAK: a timber-framed face with two paper-screen windows drawn as simple square frames divided by a few thin grid lines. ROW 2 MID: the same face with a row of scalloped roof-tile arcs along the top edge, one plain horizontal band below them, and four lattice windows. ROW 3 HARD: dense horizontal stone joint lines like a pagoda plinth, with six narrow vertical slit openings. ROW 4 ROOF CAP: a hip-and-gable tiled roof whose eaves lift very slightly at both ends, a small V ridge cap at the top, no ornament creatures, the whole roof fitting inside the row height. ROW 5 GROUND ENTRANCE: two timber lattice doors on a short plinth with only the thinnest hint of an eave line above them.",
    "style": "@common Every fill is one flat value with no tile shading, no eave shadow on the wall and no per-tile tonal variation. Tiles and lattices are LINES, never separately tinted blocks.",
    "composition": "810x1020 with five slabs of 810x204 stacked with NO gaps, NO margins and NO ground line anywhere. Full bleed edge to edge, each row tiling seamlessly left to right. The lifted eaves must stay inside the row and not overhang into the row above.",
    "color": "Ink #1A1A20 outlines. Fills #CAC4B6 for row 1, #AFA292 for row 2, #98928A for row 3, and #AFA292 again for rows 4 and 5. Values are deliberately close: rows are told apart by window shape and line density in pure greyscale, never by hue. Zero yellow, zero vermilion, zero painted eave colour. Zero ivory #F4F1E8 anywhere in the sheet."
  },
  "negative": "@common dragons, ridge creatures, statues, dancheong paint, vermilion, eave shadow, per-tile tonal variation, ground line, ivory margin, gaps between slabs, saturated colour, perspective, different hue per row",
  "accept": [
    "행 5개 204px 등간격, 여백 0",
    "그레이스케일 3단 구분",
    "처마가 위 행을 침범하지 않는다",
    "좌우 seamless",
    "#F4F1E8 픽셀 0",
    "단청·원색 0"
  ],
  "notes": "2차. 채움값 = sprites.ts:109-113 THEME_TIERS.eastasia base. 용마루 장식 짐승은 원작 도상 회피 겸 스타일 규칙상 금지."
}
```

#### floors-modern
```json
{
  "id": "floors-modern",
  "filename": "floors/modern.png",
  "consumer": "src/render/floorSheetCache.ts refreshFloorSheetAssets -> sprites.ts drawStack (floorSheets.ts floorImageKey)",
  "gen_size": "810x1020",
  "final_size": "270x340",
  "cells": "세로 5행, 각 810x204 → 270x68. weak / mid / hard / roof cap / ground entrance",
  "chroma": null,
  "prompt": {
    "subject": "Five modern building-floor slabs stacked vertically in one sheet, straight-on with zero perspective. ROW 1 WEAK: a prefab panel wall with evenly spaced vertical seam lines and two square windows. ROW 2 MID: an even glass curtain-wall grid, regular horizontal and vertical mullion lines across the whole face, panes left unfilled. ROW 3 HARD: diagonal steel X braces across the face with small rivet dots along the beams and six narrow slit windows. ROW 4 ROOF CAP: a roof deck with a thin railing of evenly spaced balusters, one cylindrical water tank on short stilts and two cubic HVAC boxes, all fitting inside the row height. ROW 5 GROUND ENTRANCE: a glass lobby with two wide square openings, a thin flat canopy line above them and a plain band at the base.",
    "style": "@common Every fill is one flat value with no panel shading, no glass reflection, no shine, no gradient in the panes and no per-panel tonal variation. Mullions and braces are LINES, never separately tinted blocks.",
    "composition": "810x1020 with five slabs of 810x204 stacked with NO gaps, NO margins and NO ground line anywhere. Full bleed edge to edge, each row tiling seamlessly left to right. The water tank and HVAC boxes sit fully inside row 4.",
    "color": "Ink #1A1A20 outlines. Fills #C0BEB8 for row 1, #AEB0B2 for row 2, #989A9D for row 3, and #AEB0B2 again for rows 4 and 5. Values are deliberately close: rows are told apart by window shape and line density in pure greyscale, never by hue. Zero yellow, zero cyan, zero neon, zero rust orange. Zero ivory #F4F1E8 anywhere in the sheet."
  },
  "negative": "@common cyan glass, reflections, shine, neon glow, rust orange, panel shading, per-panel tonal variation, ground line, ivory margin, gaps between slabs, saturated colour, perspective, different hue per row",
  "accept": [
    "행 5개 204px 등간격, 여백 0",
    "그레이스케일 3단 구분",
    "유리 반사·광택 0",
    "좌우 seamless",
    "#F4F1E8 픽셀 0"
  ],
  "notes": "2차. 채움값 = sprites.ts:114-118 THEME_TIERS.modern base. 이 테마의 mid가 '유리 커튼월'이라 뒤의 floors-special glass 행과 어휘가 겹친다 — special 쪽은 깨진 판·파편 단서로 갈라 놓았다."
}
```

### 4-6. 특수 재질 시트

#### floors-special
```json
{
  "id": "floors-special",
  "filename": "floors/special.png",
  "consumer": "src/render/floorSheetCache.ts refreshFloorSheetAssets -> sprites.ts drawStack (floorSheets.ts floorImageKey)",
  "gen_size": "810x1428",
  "final_size": "270x476",
  "cells": "세로 7행, 각 810x204 → 270x68. butter / cathedral / lobby / office / penthouse / glass / ice",
  "chroma": null,
  "prompt": {
    "subject": "Seven special material floor slabs stacked vertically in one sheet, straight-on with zero perspective. ROW 1 BUTTER: a plain slab of butter, flat solid yellow, its corners noticeably rounded so it reads as SOFT while every other row reads as HARD, with one thin peeled-wrapper hairline near the top edge and one thin foil band line near the bottom. Nothing else on this row. ROW 2 CATHEDRAL: a stone bell-tower stage, an arched frame outlined just inside the slab, and one rose window at the centre drawn as a ring inside a ring. ROW 3 LOBBY: a granite lobby, a heavy plain wall with one wide central doorway block and a tiny handle tick, and a plain base band. ROW 4 OFFICE: a curtain-wall floor made of nothing but evenly spaced thin horizontal bands running the full width, panes unfilled. ROW 5 PENTHOUSE: the top-floor stage, a plain wall with one continuous thin trim line along the very top and another along the very bottom, and two tall narrow openings in the middle. ROW 6 GLASS: a glass-alley floor, a mullion grid of tall panes with ONE pane carrying a single diagonal crack hairline and one corner pane missing its lower half. ROW 7 ICE: a frozen floor, the same wall with icicles hanging from its bottom edge as short vertical needle strokes of uneven length, plus a few interior hairlines suggesting frozen joints; ice is EXTRA INK, never a colour change and never a frost wash.",
    "style": "@common Every fill is one flat value with no recess shadow, no glass shine, no frost glow and no per-pane tonal variation. Cracks, icicles and mullions are LINES.",
    "composition": "810x1428 with seven slabs of 810x204 stacked with NO gaps, NO margins and NO ground line anywhere. Full bleed edge to edge, each row tiling seamlessly left to right. Icicles in row 7 must stay inside row 7 and not hang into the row below.",
    "color": "Ink #1A1A20 outlines. Row 1 is flat #FFD200 and is the ONLY yellow in the entire sheet. Row 2 #AEB0B2, row 3 #989A9D, row 4 #C0BEB8, row 5 #989A9D, row 6 #AEB0B2, row 7 #C0BEB8. Zero blue ice, zero cyan glass, zero white frost, zero gold trim. Zero ivory #F4F1E8 anywhere in the sheet."
  },
  "negative": "@common gold trim, second yellow, blue ice, white frost wash, snowflakes, cyan glass, reflections, shine, recess shadow, per-pane tonal variation, ground line, ivory margin, gaps between slabs, rounded corners on rows 2 to 7, perspective",
  "accept": [
    "행 7개가 정확히 204px 등간격, 여백 0",
    "노랑은 1행(버터)뿐 — 5행 펜트하우스 금장 띠 금지",
    "버터만 모서리가 둥글고 나머지는 각지다",
    "6행 유리에 반사·광택 0, 7행 얼음에 파랑·서리 0",
    "좌우 seamless",
    "#F4F1E8 픽셀 0"
  ],
  "notes": "1~5행은 butter/cathedral/lobby/office/penthouse 재질에 대응한다. 6~7행은 glass/ice GimmickId인 구역의 일반 층에 적용한다. 펜트하우스는 PNG와 프로시저럴 모두 잉크 트림선으로 통일했다. 7행 모두 소비 연결 완료."
}
```

### 4-7. 보급 상자 (10-25 신설 — 미제작)

#### crate
```json
{
  "id": "crate",
  "filename": "char/crate.png",
  "consumer": "src/render/effects.ts drawCrates — drawAsset(ctx,'crate',x,상자 중심 y). 실패하면 프로시저럴 상자(뚜껑이 젖혀지는 연출 포함)",
  "gen_size": "80x60 (4배)",
  "final_size": "20x15",
  "cells": "none",
  "anchor": "center",
  "chroma": null,
  "prompt": {
    "subject": "A small closed wooden supply crate seen from the front: a plain box with a thin lid line near the top and one cross-shaped strap band (one vertical, one horizontal ink line). No label, no text, no logo, no nails, no wood grain.",
    "style": "@common",
    "composition": "The crate fills the frame with a hairline ivory margin, perfectly front-on, no perspective.",
    "color": "Ivory #F4F1E8 ground, crate face flat #B9B3A6, ink #1A1A20 outline and strap. Zero yellow."
  },
  "negative": "@common text, label, logo, wood grain texture, nails, perspective, shading, yellow",
  "accept": [
    "20×15에서 상자로 읽힌다",
    "띠 십자 하나만"
  ],
  "notes": "10-25: PNG가 들어오면 닫힌 상자 그림 하나로 대신한다 — 뚜껑 연출은 사라지고 내용물이 솟는 연출은 남는다. 매니페스트에 anchor 'center'로 넣을 것."
}
```

## 5. 스토어 에셋 (런타임 밖)

`assets/store/` 에 둔다. `public/img/`가 아니므로 **예산 게이트·매니페스트와 무관**하다. 요구 규격 정본은 `docs/STORE_LISTING.md §그래픽 자산 체크리스트`.

### 5-1. 타이틀 키 비주얼

```json
{
  "id": "store-title-kv", "filename": "assets/store/title-kv.png (레포 루트 기준)", "consumer": "런타임 소비 없음 — Play 등록정보 및 마케팅용",
  "gen_size": "720x1280", "final_size": "360x640", "cells": "none", "chroma": null,
  "prompt": {
    "subject": "A vertical title key visual. At the bottom centre a TINY faceless stickman occupies no more than 8 percent of the frame height, seen from behind, head tilted a few degrees upward. Plain circle head with NO face. Single-line torso and limbs. He holds a thin blade as one straight line with a tiny circle grip, hanging idle at his side. Not heroic — just a small figure looking at a tall problem. Far above him a stack of building floors recedes upward and out of the top of the frame, each floor a wide short rectangle in thin line with a flat dusty fill, getting smaller and fainter toward the top and told apart only by window shape. Near the very top, a broad shallow grey demolition crossbeam with two short inward-hooking jaws at its ends, suspended from two thin vertical cables that leave the top of the frame. Exactly ONE small solid yellow operation light at the centre of the beam. A single hairline for the ground at his feet.",
    "style": "@common Apocalypse as quiet paperwork.",
    "composition": "Vertical 720x1280 portrait. Keep the upper quarter sparse so a title can be placed there later. The figure is almost comically small against the stack.",
    "color": "Ivory #F4F1E8 field, ink #1A1A20 lines, flat desaturated dusty fills on the floor slabs. Yellow #FFD200 appears exactly once, as the operation light."
  },
  "negative": "@common heroic posing, second yellow, saturated rainbow buildings, navy sky, starfield, clouds, title lettering, game logo",
  "accept": ["상단 1/4이 비어 있다(타이틀 자리)", "노랑 1곳", "글자 0 — 제목은 나중에 얹는다"],
  "notes": "ART_DIRECTION §3-F 를 흡수한 것. 이미지 안에 제목 글자를 그리지 않는다 — 스토어 툴에서 얹는다."
}
```

### 5-2. 피처 그래픽 1024×500

```json
{
  "id": "store-feature-graphic",
  "filename": "assets/store/feature-graphic.png (레포 루트 기준)",
  "consumer": "런타임 소비 없음 — Play 등록정보 피처 그래픽",
  "gen_size": "2048x1000",
  "final_size": "1024x500",
  "cells": "none",
  "chroma": null,
  "prompt": {
    "subject": "The same world as the title key visual, re-staged for a wide horizontal banner. A tiny faceless stickman stands on a single hairline ground at the lower left third, seen from behind, blade idle at his side, head tilted up. Spread across the right two thirds, three or four wide short building-floor slabs tumble downward at slight angles, drawn in thin line with flat dusty fills, told apart only by window shape — squares, arches, slits. Near the upper right, a small broad shallow demolition crossbeam with two short inward-hooking jaws and two vertical cables leaving the frame. Exactly ONE small solid yellow operation light at the centre of the beam.",
    "style": "@common The banner must read at a glance on a phone-sized store card.",
    "composition": "Horizontal 2048x1000. Keep the top quarter of the banner sparse and open so a logo can be placed there later. The figure stays small; the empty ivory between him and the falling slabs is the point.",
    "color": "Ivory #F4F1E8 field, ink #1A1A20 lines, flat desaturated dusty fills. Yellow #FFD200 appears exactly once, as the operation light."
  },
  "negative": "@common text, title lettering, game logo, taglines, heroic posing, second yellow, navy background, saturated buildings, crowded composition",
  "accept": [
    "1024×500로 줄여도 실루엣 3요소(사람·낙하 슬래브·집행기)가 읽힌다",
    "상단 1/4 여백(로고 자리)",
    "글자 0",
    "노랑 1곳"
  ],
  "notes": "타이틀 KV의 가로 재구성. 프로젝트 스타일 규칙에 따라 텍스트를 넣지 않는다. 원본의 옷을 입은 인물은 imagegen 편집으로 한 줄 졸라맨으로 수정했다."
}
```

### 5-3. 스크린샷 4장 — 생성이 아니라 캡처

프롬프트가 아니다. 게임 실화면을 찍는다.

1. `npm run dev` → 브라우저 devtools 모바일 뷰포트 **375×812**(세로). `docs/STORE_LISTING.md`가 지정한 절차 그대로.
2. 4장 촬영: **타이틀 화면 / 1막 플레이(건물 낙하 중) / 2막 보스 대치 / 버터바 라운드**.
3. 375×812는 9:16이 아니다. 문서 지정 뷰포트 캡처와 별도로 **360×640(정확한 9:16)** 실제 화면도 촬영한다.
4. HUD·버튼이 보이는 실화면이어야 한다 — 목업을 그리지 않는다.
5. 저장 위치 `assets/store/shot-01..04.png`. 예산 게이트 밖이라 원본 해상도 그대로 둬도 된다.

## 6. 미채택 · 폐기

### 6-1. GROK 문서에서 살아남지 못한 슬롯

| 구 id | 처리 | 사유 |
|---|---|---|
| `kv-title-apocalypse` | **흡수** → §5-1 | 런타임 슬롯이 아니라 스토어 에셋. `assets/store/`로 이동 |
| `bg-zone-0` … `bg-zone-7` (8장) | **흡수·폐기** | 매니페스트에 그런 키가 없다. 지역 어휘는 §4-1 bg 6종에 흡수, 나머지(야간·궤도)는 구역작전 기믹이라 배경 슬롯이 아니다 |
| `destroyer-silhouette` | 폐기 | 소비자 없음. 보스는 `boss` 부품 아틀라스를 조립한다 (09-06 변경) |
| `floors-dust-3tier` | **흡수** → §4-5 | 테마 무관 3단이라 THEME_TIERS 4테마와 안 맞는다. 테마별 5행 시트로 재편 |
| `floors-glass` / `floors-ice` | **흡수** → §4-6 6·7행 | 시트 한 장을 통째로 쓸 만큼 소비처가 없다. 특수 시트의 행으로 축소 |
| `floors-rebar` | 폐기 | 철근은 `floors-modern` 3행(hard)이 이미 X 보강+리벳으로 표현한다. 중복 |
| `waza-tenchi-sheet` / `waza-ageba-sheet` / `waza-tetsu-sheet` | 폐기 | 필살 VFX는 `src/render/effects.ts` 파티클이 전부 그린다. PNG를 넣을 자리가 코드에 없다 |
| `stick-poses-8` | **흡수** → §4-2 | 8포즈는 낡았다. 정본은 `PLAYER_SHEET` 11칸 |
| `weapons-row` | 폐기 | 무기 코스메틱은 `COSMETIC_COLORS.blade` 색 스왑이라 그림이 필요 없다 |
| `letters-pack` | 폐기 | 의성어는 폰트로 그린다. 톤 레퍼런스는 문서로 충분 |
| `boss-boreumho-v2` | **흡수** → §4-3 | 구 달 시트 폐기. 09-06 집행기 부품 아틀라스로 교체 |
| `mission-stamps` | 폐기 | 미션 UI에 인장 슬롯이 없다. 소비자 0 |
| `fx-hit` · `fx-slash` | **매니페스트에서 삭제 완료**(§7-a) | 소비자 0. 타격 스파크·참격은 기존 파티클로 처리 |

### 6-2. 08-30 생성 시트 — 레퍼런스 보관, 파이프라인 제외

`assets/ref/` 아래 아홉 장(전부 미추적). **파일은 지우지 않는다** — 건축 어휘 레퍼런스로는 여전히 쓸모가 있다. 다만 게임에 넣지 않는다.

| 파일 | 치수 | 용량 |
|---|---|---|
| `geonppu-europe-floors-3stack.png` | 810×612 | 525KB |
| `geonppu-eastasia-floors-3stack.png` | 810×612 | 732KB |
| `geonppu-modern-floors-3stack.png` | 810×612 | 453KB |
| `geonppu-europe-midfloors-4stack.png` | 810×816 | 1063KB |
| `geonppu-asia-midfloors-4stack.png` | 810×816 | 1040KB |
| `geonppu-eastasia-midfloors-4stack.png` | 810×816 | 1113KB |
| `geonppu-modern-midfloors-4stack.png` | 810×816 | 935KB |
| `geonppu-roof-caps-4stack.png` | 810×816 | 1059KB |
| `geonppu-ground-entrances-4stack.png` | 810×816 | 771KB |

**폐기 사유 (2026-09-05 육안 실측 3장 확인)**

1. **음영·AO·캐스트 섀도** — `roof-caps`는 처마 아래 드리운 그림자와 볼륨 셰이딩이 들어간 3D 렌더 톤이고 바탕마저 어두운 회갈색이다. 그 그림자가 잉크보다 어두워 **명도 위계(잉크가 제일 어둡다)를 정면으로 깬다** — 졸라맨이 다시 묻힌다.
2. **질감 노이즈** — `europe-floors-3stack`·`ground-entrances`는 면 전체에 종이·석재 그레인이 깔려 있고 벽돌마다 색조가 미세하게 다르다. "완전 무텍스처" 위반.
3. **색상(hue)으로 등급 구분** — `ground-entrances`는 층마다 웜 베이지 ↔ 쿨 블루그레이로 튄다. 그레이스케일 3단 규칙 위반인데, 프롬프트엔 "Distinguish by structure not hue"가 이미 있었다.
4. **소비자 0 · 규격 불일치** — 어느 시트도 매니페스트 키가 없고 코드가 안 읽는다. 810×612는 3행, 810×816은 4행 — 이번 정본은 5행 810×1020이다.
5. **중간층 4종 시트는 설계에서 제외** — HP 등급이 아니라 "다른 종류의 중간층"이라 `Material`(weak/mid/hard) 축과 매핑되지 않는다. 랜덤 장식 축을 새로 만들 근거가 없다.

**교훈**: 프롬프트에 "No shading"이 있어도 생성기는 무시한다. 그래서 §1 `common`에 평면성을 **한 문단으로 길게** 박고 `negative`에도 중복시켰다. 그래도 안 되면 게이트에서 잡는다 — 그게 §2 "1차는 `floors-europe` 한 장만" 규칙의 이유다.

**부수 실측**: `gunbbu-ground-810x816.png`·`gunbbu-modern-810x612.png`는 각각 `geonppu-ground-entrances-4stack.png`·`geonppu-modern-floors-3stack.png`와 바이트 동일이다(`assets/ref/`는 예산 게이트 밖이라 안 걸린다). `geonppu-asia-floors-3stack.png`는 아예 없다 — 08-30 세트는 asia 3단만 빠진 채로 멈췄다.

## 7. 부록

### 7-a. 매니페스트·소비 배선 적용 완료

- BG 7키의 `h`를 640으로 정정했다. 실제 파일은 5장으로 별칭을 공유한다.
- floors 5키를 등록하고 세로 행을 `refreshFloorSheetAssets()`에서 각각 270×68 오프스크린 타일로 잘라 설치한다. 일반 `drawAsset`의 가로 프레임 로직은 그대로다.
- `main.ts`는 `preloadAssets()` 완료 뒤 캐시를 갱신한다. 이미지가 없거나 규격이 틀리면 기존 프로시저럴 타일이 남는다.
- 지붕·입구·유리·얼음은 기존 층의 시각만 바꾼다. 내구도는 원래 HP를 눈금으로 표시하며 시뮬·점수 규칙은 유지한다.
- 사용하지 않는 `fx-hit`·`fx-slash` 키를 삭제했다. 런타임 슬롯은 **21/21 충족**, 실제 PNG **19장**.
- 파일 규격 회귀 검사는 `tests/image-assets.test.mjs`, 행 선택 검사는 `tests/render-pipeline.test.ts`에 있다.

### 7-b. 흡수 출처 기록

| 이 문서의 절 | 원 출처 | 처리 |
|---|---|---|
| §1 공통 스타일 | `ART_DIRECTION.md §3 [공통]` | 평면성 문단·negative 확장해 흡수. 원문은 포인터로 축소 |
| §4-1 bg 6종 | `GROK_IMAGE_PROMPTS.md` `bg-europe`~`bg-moon` + `bg-zone-0`~`7` 지역 어휘 + `ART_DIRECTION §3-C` | 규격을 360×470 → 360×640으로 정정, 런타임 크롭 실측 추가 |
| §4-2 player | `GROK_IMAGE_PROMPTS.md` `player` (+ 구 `stick-poses-8`) | 11칸 순서 유지, 평면성·chroma 조항 강화 |
| §4-3 boss | `GROK_IMAGE_PROMPTS.md` `boss` (+ 구 `boss-boreumho-v2`) | 흡수 후 09-06 집행기 아틀라스로 교체 |
| §4-4 ent 7종 | `GROK_IMAGE_PROMPTS.md` `ent-*` | consumer 줄 실확인해 갱신 |
| §4-5 floors 4테마 | `assets/ref/geonppu-building-prompts.md` 의 3단·지붕캡·입구 서술 | 테마별 5행으로 재조립. 중간층 4종은 미채택(§6-2) |
| §4-6 floors-special | `GROK_IMAGE_PROMPTS.md` `floors-glass`·`floors-ice` + `ART_DIRECTION §3-E`(버터) + `sprites.ts` SPECIAL_COLORS | 7행 한 장으로 통합 |
| §5-1 타이틀 KV | `ART_DIRECTION.md §3-F` + `GROK` `kv-title-apocalypse` | 스토어 절로 이동 |
| §5-2 피처 그래픽 | 신규 | `STORE_LISTING.md` 요구 규격(1024×500)에서 파생 |
| §6 폐기 목록 | `GROK_IMAGE_PROMPTS.md` 전체 + `assets/ref/` 실측 | 사유 명시 |

**삭제한 파일**: `docs/GROK_IMAGE_PROMPTS.md`(717행, git 추적) · `assets/ref/geonppu-building-prompts.md`(247행) · `assets/ref/_image5-section.md`(38행) · `assets/ref/_splice_image5_prompts.py`(뒤 둘을 합치던 일회성 스크립트, 셋 다 미추적).
**축소한 파일**: `docs/ART_DIRECTION.md §3` → 이 문서를 가리키는 포인터 3줄. §1·2·4·5는 무수정.
