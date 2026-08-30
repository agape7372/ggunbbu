# 건뿌 Grok 이미지 프롬프트

건뿌(GUNBBU) 모바일 게임 에셋용. 스타일 정본은 같은 저장소의 `docs/ART_DIRECTION.md` — 얇고 균일한 검정 잉크 `#1A1A20`, 무텍스처 아이보리 배경 `#F4F1E8`, 강조색은 노랑 `#FFD200`만, 졸라맨에 얼굴 없음, 픽셀아트·실사·두꺼운 외곽선 없음. 월드 이미지에 UI 크롬을 넣지 않는다.

이미지 안에 글자·이름·로고를 그리지 않는다. 주인공(얼굴 없는 졸라맨 **뿌뿌**)과 파괴자(감시 위성달 **보름호**) 고유명은 아래 `notes`에만 적는다.

## 사용법

1. 아래 `common` JSON 전체를 복사해 두고, 그 `prompt`를 **공통 스타일 블록**으로 쓴다.
2. 뽑을 에셋의 JSON 펜스 **전체**를 연다. `common`이 `true`이면 Grok에 넣을 때 **공통 블록을 앞에 붙인 뒤** 그 에셋의 `prompt`를 이어 붙인다.
3. `negative`는 네거티브 칸에 그대로 넣는다. 칸이 없으면 프롬프트 끝에 ` Avoid: ` + `negative`를 한 줄로 붙인다.
4. 한 번에 한 `id`만 생성한다. 나온 PNG 파일명은 `filename`과 같게 저장한다.
5. 해상도는 `size`를 맞춘다. 배경·타이틀 KV는 **360×640 세로**가 아니면 폐기한다. 검수는 360×640으로 줄여 놓고 한다.

---

## 공통 스타일

매 에셋(`common: true`) 앞에 붙이는 블록. `ART_DIRECTION.md` [공통] 원문.

```json
{
  "id": "common",
  "prompt": "Minimal line art. Thin, even-weight black ink strokes (#1A1A20) with rounded caps, drawn with a slight hand-drawn wobble but never rough or sketchy. Flat warm ivory background #F4F1E8, completely untextured. Only one accent color allowed: yellow #FFD200. No shading, no gradients, no drop shadows, no outlines thicker than the stroke itself, no texture, no pixel art, no photographic elements. Generous empty space — the drawing occupies a small part of the frame. Deadpan and quiet. No text, no logo, no watermark, no UI."
}
```

---

## 목록

| id | size | 용도 |
|---|---|---|
| `kv-title-apocalypse` | 360x640 | 타이틀 KV |
| `bg-zone-0` … `bg-zone-7` | 360x640 | 세로 배경 8장 |
| `destroyer-silhouette` | 640x640 | 위성달이 층을 던지는 실루엣 |
| `floors-dust-3tier` | 1024x768 | 먼지톤 약/중/강 층 |
| `floors-glass` / `floors-ice` / `floors-rebar` | 1024x768 | 재질 층 시트 |
| `waza-tenchi-sheet` / `waza-ageba-sheet` / `waza-tetsu-sheet` | 1280x640 | 필살 VFX |
| `stick-poses-8` | 1920x640 | 졸라맨 8포즈 |
| `weapons-row` | 1280x360 | 얇은 칼 5자루 |
| `letters-pack` | 1280x640 | 의성어 레터링 톤 레퍼런스 |
| `boss-boreumho-v2` | 640x640 | 보스 달 |
| `mission-stamps` | 1920x360 | 미션 원형 인장 8종 |
| — 아래부터 Wave 3: manifest.json 실제 슬롯 — | | |
| `player` | 2024x240→506x60 | 플레이어 11프레임 시트 (manifest `player`) |
| `boss` | 1280x256→320x64 | 보스 4프레임 시트 (manifest `boss`) |
| `ent-bolt` | 48x160→12x40 | 낙뢰 낙하물 (manifest `ent-bolt`) |
| `ent-boltCue` | 48x48→12x12 | 낙뢰 예고 (manifest `ent-boltCue`) |
| `ent-rock` | 96x80→24x20 | 낙석 (manifest `ent-rock`) |
| `ent-shotOk` | 64x40→16x10 | 가드 가능 탄(속 빈 고리, manifest `ent-shotOk`) |
| `ent-shotNo` | 64x40→16x10 | 회피 전용 탄(속 찬 원+가시, manifest `ent-shotNo`) |
| `ent-rabbit` | 112x80→28x20 | 정찰 드론(토끼 아님, manifest `ent-rabbit`) |
| `ent-cannon` | 96x112→24x28 | 고정 포탑 (manifest `ent-cannon`) |
| `fx-hit` | 288x96→72x24 | 타격 스파크 3프레임 (manifest `fx-hit`) — ★**소비자 없음** |
| `fx-slash` | 192x192→48x48 | 참격 궤적 단독 VFX (manifest `fx-slash`) — ★**소비자 없음** |

★**fx 2종은 매니페스트에만 있고 코드가 안 그린다**(2026-08-30 실측, `npm run check:budget`가 매번 센다).
지금 이펙트는 `src/render/effects.ts`의 파티클이 전부라 PNG를 넣어도 화면에 안 나온다. **생성 전에**
① 렌더러에 그릴 자리를 먼저 만들지, ② 매니페스트에서 두 키를 뺄지 정할 것 — 안 정하면 안 쓰는 그림이 나온다.
| `bg-europe` | 360x470 | 1막 유럽 회랑 배경 (manifest `bg-europe`) |
| `bg-asia` | 360x470 | 1막 시장 배경 (manifest `bg-asia`) |
| `bg-eastasia` | 360x470 | 1막 기와능선 배경 (manifest `bg-eastasia`) |
| `bg-modern` | 360x470 | 특별작전 유리골목/철근 배경 (manifest `bg-modern`) |
| `bg-act2` | 360x470 | 2막 대성당·탑 폐허 배경 (manifest `bg-act2`) |
| `bg-bonus` | 360x470 | 버터 보너스 라운드 배경 (manifest `bg-bonus`) |
| `bg-moon` | 360x470 | 최종 달 대치 배경 (manifest `bg-moon`) |

---

## 키 비주얼

### kv-title-apocalypse

```json
{
  "id": "kv-title-apocalypse",
  "filename": "kv-title-apocalypse.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical title key visual, tall 360x640 portrait. At the bottom center a TINY faceless stickman occupies no more than 8 percent of the frame height, seen from behind, head tilted a few degrees upward, looking up. Plain circle head with NO face — no eyes, no mouth, no nose. Single-line torso, single-line limbs. He holds a thin blade drawn as one straight line with a tiny circle for the grip, hanging idle at his side. Not heroic; just a small figure looking at a tall problem. High above him, building-floor rectangles fall from a satellite-moon: a large thin-line circle near the top of the frame, a few small crater circles inside (line only, no fill), and exactly ONE mechanical lens iris filled solid yellow #FFD200. That yellow iris is the only yellow in the entire image. Short straight antenna stubs on the moon rim. From the moon, two or three wide-short dusty grey-brown nearly desaturated floor slabs tumble downward, slightly askew, told apart only by window shape (squares, arches, slits) and line density, never by saturated color. Keep the upper quarter sparse so a title can be placed later. The sky is empty ivory — no clouds, no sun, no stars, no navy, no gradient. A single hairline for the ground at his feet. Apocalypse as quiet paperwork. No UI chrome, no HUD, no buttons.",
  "negative": "pixel art, dot art, 16-bit, photorealism, photograph, cinematic lighting, thick outlines, drop shadows, gradients, texture, UI chrome, HUD, buttons, logo, watermark, text, letters, facial features, eyes, mouth, clothing, saturated rainbow buildings, navy sky, starfield, clouds, heroic posing, second yellow accent",
  "notes": "타이틀 화면 세로 KV. 아래 작은 뿌뿌가 위를 보고, 보름호(노란 렌즈 하나)에서 층이 떨어진다."
}
```

---

## 배경 — 제0~7구역

논리 캔버스 360×640. 스카이라인은 **하단 15%만**, 상단 85%는 빈 아이보리. 배경은 플레이 뒤에 사라지는 그림이다. 월드 이미지에 UI 크롬 금지.

### bg-zone-0

```json
{
  "id": "bg-zone-0",
  "filename": "bg-zone-0.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640. A distant European stone skyline along the VERY BOTTOM EDGE only — limestone rooftops, low cornices, a broken pediment, two or three arched window holes as simple arched lines, a colonnade suggested by three vertical strokes, a water tank, a stub antenna. Thin black outlines with NO fill, one continuous pen contour. Rooftops of slightly different heights but all modest, never skyscrapers. Composition: the skyline occupies ONLY the bottom 15 percent of the frame. The upper 85 percent is completely empty warm ivory #F4F1E8 — no clouds, no sun, no stars, no birds, no moon, no yellow, no gradient, no navy. This background must disappear behind gameplay. If it draws attention it is wrong. No characters. No roads in perspective. No ground texture. A single hairline for the horizon is enough. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, clouds, sun, stars, navy sky, yellow accent, saturated building colors, fill on skyline, skyscrapers, perspective streets",
  "notes": "1막 서쪽 회랑(유럽 석조·아치) 세로 배경. 스카이라인은 하단 15%만."
}
```

### bg-zone-1

```json
{
  "id": "bg-zone-1",
  "filename": "bg-zone-1.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640. A distant Asian market skyline along the VERY BOTTOM EDGE only — low flat stall roofs, a few lattice window grids as tiny hash marks, a scaffold suggestion of two or three verticals, a market awning as a simple triangle stroke, a crooked chimney, one tiny boat-roof bump implying a river without drawing water, without ripples, without blue. Thin black outlines with NO fill, one continuous pen contour. No fog, no mist wash — emptiness is ivory, not haze. Composition: the skyline occupies ONLY the bottom 15 percent of the frame. The upper 85 percent is completely empty warm ivory #F4F1E8 — no clouds, no sun, no stars, no yellow, no gradient, no navy. This background must disappear behind gameplay. If it draws attention it is wrong. No characters. No crowds. No signage. No text. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, crowds, signage, clouds, fog wash, navy sky, yellow accent, blue water, saturated market colors",
  "notes": "1막 강턱 시장(아시아 좌판·격자) 세로 배경. 안개·물 채움 금지."
}
```

### bg-zone-2

```json
{
  "id": "bg-zone-2",
  "filename": "bg-zone-2.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640. A distant East-Asian tiled-roof skyline along the VERY BOTTOM EDGE only — wooden houses with gentle curved eaves, overlapping roof waves suggested by a few scalloped strokes, a chimney, a stone lantern as two tiny stacked rectangles, a bare flagpole, paper-screen windows as small square frames without glow. Thin black outlines with NO fill, one continuous pen contour. Roofs step like a low hill, not a mountain. No bright paint, no vermilion, no saturated wood brown. No moon. Composition: the skyline occupies ONLY the bottom 15 percent of the frame. The upper 85 percent is completely empty warm ivory #F4F1E8 — no clouds, no sun, no stars, no yellow, no gradient, no navy. This background must disappear behind gameplay. If it draws attention it is wrong. No characters. No cherry blossoms. No calligraphy. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, cherry blossoms, calligraphy, clouds, moon, navy sky, yellow accent, vermilion, saturated wood",
  "notes": "1막 기와능선(동아시아 기와·처마) 세로 배경. 달 없음."
}
```

### bg-zone-3

```json
{
  "id": "bg-zone-3",
  "filename": "bg-zone-3.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640. A distant modern rebar-coast skyline along the VERY BOTTOM EDGE only — unfinished concrete slab rectangles, a few curtain-wall grid fragments as tiny window ticks, diagonal rebar X-braces on one ruin, a crane jib as a single long thin line with a hook tick, a water tank, rivet dots as the smallest circles. Thin black outlines with NO fill, one continuous pen contour. No ocean fill, no waves, no blue — the shore is implied by a slightly broken baseline and one low pier rectangle. Composition: the skyline occupies ONLY the bottom 15 percent of the frame. The upper 85 percent is completely empty warm ivory #F4F1E8 — no clouds, no sun, no stars, no yellow, no gradient, no navy, no aircraft. This background must disappear behind gameplay. If it draws attention it is wrong. No characters. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, ocean fill, waves, blue water, clouds, navy sky, yellow accent, rust orange, aircraft",
  "notes": "1막 철근 해안(미완 슬래브·리벳) 세로 배경."
}
```

### bg-zone-4

```json
{
  "id": "bg-zone-4",
  "filename": "bg-zone-4.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640. A distant glass-alley skyline along the VERY BOTTOM EDGE only — empty office stubs with THIN WINDOW LINES, very sparse tall rectangles of different heights but still low in the frame, each face a faint grid of tiny square window ticks, one shattered pane suggested by a single diagonal hairline inside a square, a rooftop HVAC box, a thin spire. Thin black outlines with NO fill. Glass is line, never cyan, never reflection, never gradient shine. Density is lower than a packed city — more empty gaps between buildings so the alley feels hollow. Composition: the skyline occupies ONLY the bottom 15 percent of the frame. The upper 85 percent is completely empty warm ivory #F4F1E8 — no clouds, no sun, no stars, no yellow, no gradient, no navy, no lens flare. This background must disappear behind gameplay. If it draws attention it is wrong. No characters. No cars. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, cars, cyan glass, reflections, lens flare, clouds, navy sky, yellow accent, filled windows",
  "notes": "특별작전 유리 골목 세로 배경. 유리는 얇은 창선만, 반사·청록 채움 없음."
}
```

### bg-zone-5

```json
{
  "id": "bg-zone-5",
  "filename": "bg-zone-5.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640. A distant ice-pier skyline along the VERY BOTTOM EDGE only — low warehouse shed rectangles, a derrick as an A-frame of three lines, a bollard as a tiny stub. Icicles hang from every eave as LINE ONLY — short vertical ticks and a few longer needle strokes, never blue fill, never white highlight, never snow texture, never frost shading. Ice is extra ink, not a palette change. No frozen sea surface, no cracks-as-texture across the sky. Thin black outlines with NO fill, one continuous pen contour. Composition: the skyline occupies ONLY the bottom 15 percent of the frame. The upper 85 percent is completely empty warm ivory #F4F1E8 — no clouds, no sun, no stars, no yellow, no gradient, no navy, no aurora. This background must disappear behind gameplay. If it draws attention it is wrong. No characters. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, snow texture, frost shading, blue ice fill, aurora, clouds, navy sky, yellow accent, penguins",
  "notes": "특별작전 빙결 부두 세로 배경. 고드름은 처마에서 내리는 선만."
}
```

### bg-zone-6

```json
{
  "id": "bg-zone-6",
  "filename": "bg-zone-6.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640, night throw in NAME only — the art direction stays BRIGHT. The sky is a slightly duskier warm ivory (still clearly ivory/cream, approximately #EBE6DC), NEVER dark navy, NEVER black, NEVER a starfield. Along the very bottom edge, a sparse skyline in thin black outline with NO fill: a few low rooftops, a water tank, antennas, as a single quiet contour occupying ONLY the bottom 15 percent of the frame. In the large empty ivory above, one mark only: a sparse THIN crescent moon drawn as one incomplete circular stroke, small, high, and lonely — black ink line, no fill, no yellow. No stars, no constellations, no city lights, no window glow, no gradient dusk, no clouds. The upper 85 percent remains almost empty ivory. This background must disappear behind gameplay. If the night feels dark, it is wrong. No characters. No UI chrome. No yellow anywhere in this image.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, navy sky, black sky, starfield, city lights, window glow, clouds, yellow accent, sun, filled moon",
  "notes": "특별작전 야간 투척 세로 배경. 하늘은 조금 어두운 아이보리일 뿐. 얇은 달 획 하나, 노랑 없음."
}
```

### bg-zone-7

```json
{
  "id": "bg-zone-7",
  "filename": "bg-zone-7.png",
  "size": "360x640",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x640, orbital drop — standing on the ground looking up the throw-path, still BRIGHT ivory, NOT outer space, NOT navy. Along the very bottom edge only, a ripped-foundation skyline in thin black outline with NO fill: sheared floor plates, broken columns as short vertical ticks, occupying ONLY the bottom 15 percent of the frame. In the vast empty ivory above, almost nothing except exactly ONE tiny solid yellow #FFD200 dot high in the upper fifth of the frame — a distant surveillance iris, not a sun, not a star, not a streetlamp. That yellow dot is the only yellow and the only mark in the sky. No moon disk, no crater field, no stars, no Earth-from-orbit photography, no spacecraft, no grid, no atmosphere band, no gradient. The upper 85 percent is empty ivory with only that one high yellow dot. This background must disappear behind gameplay. If it looks like outer space, it is wrong. No characters. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, outer space, navy sky, starfield, planet Earth, spacecraft, clouds, second yellow, filled moon disk",
  "notes": "특별작전 궤도 직하 세로 배경. 우주·남색 금지. 높은 곳의 노란 점 하나만 강조."
}
```

---

## 파괴자

### destroyer-silhouette

```json
{
  "id": "destroyer-silhouette",
  "filename": "destroyer-silhouette.png",
  "size": "640x640",
  "common": true,
  "prompt": "Subject: a satellite-moon throwing a building down, centered on a square ivory field with wide empty margin. A perfect thin-line circle (the moon/satellite) with a few small crater circles inside, line only, no fill. One inner circle is a mechanical lens iris filled solid yellow #FFD200 — that iris is the only yellow in the image. A few short straight antenna lines on the rim, one slightly bent. From the lower edge of the circle, a wide-short building-floor rectangle falls downward, outlined in thin black ink, filled muted dusty grey-brown nearly desaturated, two square windows as thin-line holes, slightly askew as if just released. No engines, no flames, no face, no expression, no greeble. The drawing sits small in the square, maybe 45 percent of the frame, floating with empty ivory all around. No ground. No clouds. No UI chrome. Quiet industrial throw, not a war poster. Readable if shrunk to 80 pixels wide.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, face, expression, engines, flames, crane ship, greeble, clouds, second yellow, navy background",
  "notes": "보름호(위성달, 노란 홍채)가 층 하나를 아래로 던지는 정사각 실루엣."
}
```

---

## 층 타일

정면, 원근 없음. 좌우 타일 가능한 넓은 짧은 직사각형. 약/중/강은 창 모양과 선 밀도로만 구분하고 색으로 나누지 않는다.

### floors-dust-3tier

```json
{
  "id": "floors-dust-3tier",
  "filename": "floors-dust-3tier.png",
  "size": "1024x768",
  "common": true,
  "prompt": "Subject: building floors drawn straight-on with no perspective. Three variants stacked vertically in one image, same width, same thin even-weight line, wide short proportions, each a flat rectangle outlined in thin black ink and filled with muted dusty grey-brown, nearly desaturated, values close to each other. TOP (weak): plain face, two square windows as simple thin-line rectangles, no other detail. MIDDLE (mid): the same face with evenly spaced horizontal joint lines, four arched-top windows. BOTTOM (hard): the same face with a dense grid of joint lines, six narrow vertical slit windows. The three must be distinguishable in pure greyscale by window shape and line density alone — NOT by color. Nothing saturated, nothing bright, no yellow. Each floor should look as if it could tile seamlessly left to right. Generous ivory margin around the stack. No ground, no sky, no stickman, no cracks-as-texture, no brick photograph, no UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, stickman, saturated colors, yellow accent, perspective, brick photo, different fill colors per tier",
  "notes": "먼지톤 약/중/강 층 3단. 창 모양·선 밀도로만 등급을 가른다."
}
```

### floors-glass

```json
{
  "id": "floors-glass",
  "filename": "floors-glass.png",
  "size": "1024x768",
  "common": true,
  "prompt": "Subject: glass curtain-wall building floors, one sheet, straight-on, no perspective. Three wide short rectangles stacked vertically, same width, same thin even-weight outline. Fills are muted dusty grey-brown, nearly desaturated, slightly cooler in value than stone but NEVER blue, never cyan, never reflective shine, never gradient. Distinction is window-grid density only: TOP sparse — two large square panes as empty thin-line frames. MIDDLE even curtain-wall grid, eight medium squares. BOTTOM dense mullion grid, many narrow vertical pane slits, plus one diagonal hairline suggesting a cracked pane without shards or shine. No yellow. No sky reflection. No stickman. No UI chrome. Each floor tiles left to right in the mind. Ivory margin around the stack. Deadpan office emptiness.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, stickman, cyan glass, reflections, shine, yellow accent, blue fill, perspective",
  "notes": "유리 커튼월 층 시트. 청록·반사 없이 창 격자 밀도만으로 약/중/강을 나눈다."
}
```

### floors-ice

```json
{
  "id": "floors-ice",
  "filename": "floors-ice.png",
  "size": "1024x768",
  "common": true,
  "prompt": "Subject: iced warehouse floors, one sheet, straight-on, no perspective. Three wide short rectangles stacked vertically, same width, same thin even-weight outline, filled with muted dusty grey-brown nearly desaturated — ice does NOT change the fill color, no pale blue, no white frost wash. Ice is LINE ONLY: icicles hang from the bottom edge of each floor as short vertical needle strokes and a few longer drips; a few interior hairlines suggest frozen joints. TOP: two square windows, sparse icicles. MIDDLE: four arched windows, denser icicle fringe. BOTTOM: six slit windows plus the densest icicle comb along the soffit. Distinguishable in greyscale by window shape, joint density, and icicle count — not by color. No yellow. No snowflakes. No stickman. No UI chrome. Tileable left to right. Ivory margin. Deadpan cold, not a winter postcard.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, stickman, blue ice, white frost wash, snowflakes, yellow accent, winter landscape, perspective",
  "notes": "빙결 층 시트. 고드름은 하단 처마 선만. 파랑 채움 금지."
}
```

### floors-rebar

```json
{
  "id": "floors-rebar",
  "filename": "floors-rebar.png",
  "size": "1024x768",
  "common": true,
  "prompt": "Subject: unfinished rebar-and-slab building floors, one sheet, straight-on, no perspective. Three wide short rectangles stacked vertically, same width, same thin even-weight outline, filled with muted dusty grey-brown nearly desaturated. Distinction by line density and window shape: TOP two square openings, a few exposed rebar ticks poking from the top edge like short verticals. MIDDLE four arched openings, evenly spaced horizontal form-joint lines, small rivet circles along one beam. BOTTOM six slit openings, dense diagonal X-braces, more rivet circles, rebar fringe along the top. No rust orange, no brown paint, no yellow. Metal is ink, not material photography. No stickman. No UI chrome. Tileable left to right. Ivory margin. Hard, hollow construction.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, stickman, rust orange, brown paint, yellow accent, photo metal, perspective",
  "notes": "철근·리벳 층 시트. 녹주황 없이 가새와 리벳 원·창 밀도로 구분한다."
}
```

---

## 필살 VFX 시트

한 장에 노랑 `#FFD200`은 지정한 궤적·버스트 **한 계통만**. 졸라맨은 얼굴 없는 원 머리. 이미지에 이름 글자 없음.

### waza-tenchi-sheet

```json
{
  "id": "waza-tenchi-sheet",
  "filename": "waza-tenchi-sheet.png",
  "size": "1280x640",
  "common": true,
  "prompt": "Subject: special-move VFX sheet — a heaven-and-earth yellow slash. Wide horizontal sheet, three beats in one row, IDENTICAL SCALE, one shared ground line. Faceless stickman: plain circle head with NO face, single-line torso and limbs, thin blade as one straight line with a tiny circle grip, side view facing right. Beat 1: tiny figure at rest, blade lowered, empty ivory around him. Beat 2: deep follow-through lunge, both hands on the grip; a SINGLE vertical yellow #FFD200 slash runs from the top of the cell to the ground as one even-weight ink stroke with a slight wobble, splitting the ivory like paper — that yellow line is the only yellow. Beat 3: afterimage of the same vertical yellow hairline, already thinning, figure recovered small. A muted dusty grey-brown floor rectangle may sit bisected on the ground line in beats 2 and 3, cut clean, no explosion, no debris spray, no speed lines except the yellow slash itself. No extra yellow sparks. No facial features. No UI chrome. No letters. Figures stay small in their cells. Readable at 50 pixels tall. Deadpan cataclysm.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, letters, watermark, facial features, explosion, debris spray, speed lines, extra yellow sparks, second slash color",
  "notes": "필살 천지개벽 VFX. 화면을 세로로 가르는 노란 참격 한 줄."
}
```

### waza-ageba-sheet

```json
{
  "id": "waza-ageba-sheet",
  "filename": "waza-ageba-sheet.png",
  "size": "1280x640",
  "common": true,
  "prompt": "Subject: special-move VFX sheet — an upward yellow cut that lifts a floor. Wide horizontal sheet, three beats in one row, IDENTICAL SCALE, one shared ground line. Faceless stickman: plain circle head with NO face, single-line body, thin blade with tiny circle grip, side view facing right. Beat 1: crouch, blade low behind him, a dusty grey-brown floor slab resting on the shared ground line. Beat 2: rising cut — body opens upward, blade swinging from low to high; a SINGLE sweeping yellow #FFD200 arc climbs from the slab toward the top of the cell, even-weight, rounded caps; the slab is now a few body-heights up, still the same rectangle, not spinning wildly. Beat 3: figure recovered, slab higher and smaller, the yellow arc a fading continuation of the same one stroke, not a second color. That yellow arc is the only yellow in the image. No explosion, no motion blur, no extra sparks, no face. No UI chrome. No letters. Figures small in cells, readable at 50 pixels tall. Quiet launch, not a fireball.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, letters, watermark, facial features, explosion, fireball, motion blur, extra sparks, second yellow",
  "notes": "필살 올려베기 VFX. 층을 띄우는 위로 열린 노란 호 하나."
}
```

### waza-tetsu-sheet

```json
{
  "id": "waza-tetsu-sheet",
  "filename": "waza-tetsu-sheet.png",
  "size": "1280x640",
  "common": true,
  "prompt": "Subject: special-move VFX sheet — a shield burst, not a cutting attack. Wide horizontal sheet, three beats in one row, IDENTICAL SCALE, one shared ground line. Faceless stickman: plain circle head with NO face, single-line body, thin blade with tiny circle grip held as a guard, side view facing right. Beat 1: compact guard, knees bent, blade raised horizontally above the head with both arms, a dusty grey-brown floor slab approaching from above as a simple rectangle. Beat 2: the slab contacts the blade; a SINGLE yellow #FFD200 burst — a thin even-weight ring or short radiating ticks around the guard, rounded caps, not a thick explosion, not flames, not a slash through the slab. The slab bounces, still whole. Beat 3: figure still bracing, burst already a thinning yellow hairline ring, slab slightly higher again. That yellow burst is the only yellow. No chrome, no molten metal, no orange rust, no face. No UI chrome. No letters. He does not destroy the floor; he holds and rebounds. Figures small, readable at 50 pixels tall. A shield, not an energy beam.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, letters, watermark, facial features, cutting slash through the floor, explosion, fire, energy beam, molten metal, second yellow",
  "notes": "필살 철벽 VFX. 층을 쪼개지 않고 가드에서 튕기는 노란 방패 버스트."
}
```

---

## 캐릭터 · 무기

### stick-poses-8

```json
{
  "id": "stick-poses-8",
  "filename": "stick-poses-8.png",
  "size": "1920x640",
  "common": true,
  "prompt": "Subject: character sheet of a faceless stickman. Plain circle head with NO face at all — no eyes, no mouth, nothing. Single-line torso, single-line limbs with simple joint bends. Thin blade as one straight line with a tiny circle for the grip. Layout: EIGHT poses in one horizontal row, side view facing RIGHT, ALL AT IDENTICAL SCALE ON ONE SHARED GROUND LINE, evenly spaced, each figure small in its cell with clear empty ivory around it. Draw the shared ground line as one continuous hairline under all eight. Do not draw numbers, labels, or text. 1 IDLE — standing upright, blade lowered at his side, relaxed. 2 ATTACK — deep forward lunge, blade swung down and through; this is the ONLY pose that may show a single sweeping yellow #FFD200 arc behind the blade; that arc is the only yellow in the entire sheet. 3 GUARD — blade raised horizontally above the head with both arms, knees bent, bracing. 4 JUMP — airborne above the same ground line, both knees tucked, blade trailing behind, same body scale as idle. 5 AIR-ATTACK — airborne above the same ground line, body in a downward swing, blade arcing down, NO yellow (the one yellow already belongs to pose 2), same body scale. 6 PINNED — flattened on the ground line, limbs splayed sideways, still the same scale. 7 DEAD — collapsed on his back along the ground line, limbs limp, silhouette different from pinned. 8 SPECIAL — two-handed follow-through lunge on the ground line, blade low; no extra yellow here. Silhouette must stay readable when shrunk to 50 pixels tall. No clothing, no hair, no face, no second yellow, no UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, numbers, labels, watermark, facial features, eyes, mouth, clothing, hair, different scale per pose, different ground heights, second yellow, cling pose",
  "notes": "뿌뿌 8포즈(대기·공격·가드·점프·공중공격·깔림·사망·필살). 동일 스케일·공유 지면선. 노랑은 공격 포즈의 참격 호만."
}
```

### weapons-row

```json
{
  "id": "weapons-row",
  "filename": "weapons-row.png",
  "size": "1280x360",
  "common": true,
  "prompt": "Subject: FIVE thin blades in one horizontal row on empty ivory, IDENTICAL LENGTH AND SCALE, lying parallel like a tool catalog, generous space between them. No character, no hands. Each blade is still a thin even-weight ink stroke with a tiny circle grip — skins change silhouette slightly, never become detailed swords, never grow guards or fuller engravings. Left to right, no labels, no text: 1 perfectly straight hairline blade, tiny empty circle pommel. 2 the same length with two slight kinks and three tiny rivet circles along the shaft, still one line, no rust color. 3 the same length, very shallow crescent curve, grip circle intact. 4 the same length, slightly rounder tip. 5 the same length, grip circle filled solid yellow #FFD200 — that fill is the only yellow in the image. No scabbards, no reflections, no thick outlines, no UI chrome. Readable when the whole row is shrunk to 240 pixels wide. Deadpan inventory.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, labels, watermark, character, hands, ornate swords, scabbards, reflections, rust color, second yellow",
  "notes": "얇은 칼 5자루 가로 나열. 동일 스케일·손잡이 원. 캐릭터 없음. 노랑은 맨 오른쪽 자루 원 채움만."
}
```

---

## 의성어 레터링

게임은 폰트를 쓴다. 이 장은 톤 레퍼런스일 뿐. HUD·버튼·점수판은 그리지 않는다.

### letters-pack

```json
{
  "id": "letters-pack",
  "filename": "letters-pack.png",
  "size": "1280x640",
  "common": true,
  "prompt": "Subject: style-reference sheet for onomatopoeia lettering in the same thin-line world. The GAME will use a font; this image is TONE ONLY — how impact words should feel, not a UI mockup. Three Hangul word treatments in one horizontal row, plenty of ivory between them, no boxes, no plates, no chrome, no buttons, no bars, no score counters. The letterforms are drawn as thin even-weight ink, slightly hand-drawn wobble, rounded terminals, never brush-script flourish, never bubble comic type, never pixel fonts. LEFT: the compact impact word 콰직 — tight Hangul blocks as constructed line letters, small, dry, like a snapped stick. CENTER: the large split word 천지개벽 — Hangul blocks as a quiet banner, slightly taller; a SINGLE vertical yellow #FFD200 hairline slash cuts through the middle of the word, and that slash is the only yellow in the image. RIGHT: the tiny tap word 탁 — two Hangul blocks, smallest of the three, dry and brief. No English translations, no romanization, no stickman, no buildings, no speech balloons. Lettering must stay readable when the sheet is shrunk to 360 pixels wide. Same world as the faceless stickman, not a different graphic novel.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, buttons, scoreboard, health bars, logo, watermark, speech balloons, English captions, romanization, stickman, bubble comic type, extra yellow",
  "notes": "의성어 레터링 톤 레퍼런스(게임은 폰트 사용). 콰직 / 천지개벽 / 탁. HUD 목업 금지. 노랑은 천지개벽을 가르는 참격 한 줄."
}
```

---

## 보스

### boss-boreumho-v2

```json
{
  "id": "boss-boreumho-v2",
  "filename": "boss-boreumho-v2.png",
  "size": "640x640",
  "common": true,
  "prompt": "Subject: a surveillance satellite-moon. A perfect circle drawn in thin black line, large but with clear empty ivory margin on a square canvas. A few small circles inside for craters, thin line only, no fill. One of those inner circles is different: a mechanical lens iris filled solid yellow #FFD200 — that iris is the only yellow in the image. A few short straight antenna lines project from the circle rim, uneven lengths, one slightly bent as if damaged. Optional: two tiny rectangular panel ticks as unfilled line on left and right, not blue, not filled. No face, no mouth, no rabbit, no expression, no crater shading. Absurd rather than menacing — a moon that happens to be watching you. Centered. No UI chrome. Readable when shrunk to 64 pixels. Quiet broken satellite.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, face, mouth, eyes besides the one iris, rabbit, expression, crater shading, blue solar panels, second yellow, navy background",
  "notes": "보스 보름호. 달 원 + 운석구 + 노란 기계 홍채 하나 + 얇은 안테나."
}
```

---

## 미션 인장

### mission-stamps

```json
{
  "id": "mission-stamps",
  "filename": "mission-stamps.png",
  "size": "1920x360",
  "common": true,
  "prompt": "Subject: EIGHT small circular stamp icons in one horizontal row, IDENTICAL CIRCLE SIZE, evenly spaced, each a thin even-weight ink ring on ivory, icons inside also thin line art, no letters, no digits, no English, no Hangul. Left to right: 1 BUILDINGS — two stacked dusty grey-brown nearly desaturated floor rectangles with two square windows, still inside the ring, fills muted. 2 COMBO — three short stacked slash ticks like tally marks, black ink only. 3 SPECIAL — a single diagonal hairline cut across the circle, black ink, not yellow. 4 SURVIVE — a tiny faceless stickman (plain circle head, NO face, single-line body) standing under a horizontal slab tick that has not quite touched him. 5 AD — two small concentric incomplete arcs like a quiet broadcast ripple, black ink, no play-button triangle, no speaker box. 6 ACT2 — three stacked floor ticks getting slightly smaller upward, suggesting a taller climb, black ink only. 7 MOON — a circle-in-circle with two short antenna stubs, iris as empty line, not filled. 8 BUTTER — a small rounded rectangle slab filled solid yellow #FFD200 with one wrapper hairline near the top edge; that butter fill is the only yellow in the entire row. No wax seals, no ribbons, no drop shadows, no perforated edges as texture, no UI mockup around the row. Stamps must read at 48 pixels diameter. Quiet bureaucracy.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, buttons, text, letters, digits, watermark, wax seals, ribbons, play-button icon, speaker box, second yellow, facial features",
  "notes": "미션 원형 인장 8종 한 줄: 건물·콤보·필살·생존·광고·2막·달·버터. 글자 없음. 노랑은 버터 인장만."
}
```

---

## 매니페스트 슬롯 정렬 (Wave 3 — 게임이 실제 로드하는 파일)

위 항목들(`bg-zone-0`…`7`, `stick-poses-8`, `boss-boreumho-v2` 등)의 `id`는 실제 로더가 찾는 키가 아니다.
게임이 부팅 시 읽는 슬롯 정본은 `src/assets/manifest.json`이고, 이 절의 `id`가 그 키와 **1:1**이다:
`player`, `boss`, `ent-bolt`, `ent-boltCue`, `ent-rock`, `ent-shotOk`, `ent-shotNo`, `ent-rabbit`, `ent-cannon`,
`fx-hit`, `fx-slash`, `bg-europe`, `bg-asia`, `bg-eastasia`, `bg-modern`, `bg-act2`, `bg-bonus`, `bg-moon`.
파일은 `manifest.json`의 `src`가 가리키는 경로 그대로 `public/img/` 아래 놓는다(예: `player` → `public/img/char/player.png`).

### 크로마키 주의 — `player`·`boss`·`ent-*`·`fx-*` 전용 (`bg-*`는 해당 없음)

이 슬롯들은 manifest에 `"chroma": "#F4F1E8"`가 박혀 있다 — 로더가 이 정확한 색을 투명 처리한다.

- 배경은 반드시 **순수 단색 #F4F1E8**, 그라데이션·비네트·질감 0. 색이 조금이라도 섞이면 그 픽셀만 안 뚫리고 아이보리 헤일로가 남는다.
- 캐릭터·오브젝트 내부를 아이보리로 칠하는 하이라이트 금지 — 그 부분이 뚫려 구멍이 난다.
- manifest 실치수가 매우 작다(예: `ent-bolt` 12×40). 아래 각 프롬프트의 "생성 크기"로 크게 뽑고, 실치수로 축소한 뒤 크로마키 추출한다. `player`는 팀장 지시대로 4배(2024×240)로 뽑아 506×60(11프레임×46, h60)으로 축소.
- 시트 안 프레임 순서는 `src/render/frames.ts`의 `PLAYER_SHEET`/`BOSS_SHEET` 배열이 정본이다 — 셀 순서를 바꾸면 게임이 엉뚱한 포즈를 보여준다. 아래 프롬프트는 그 배열 순서 그대로 썼다.

### 배경 슬롯 주의 — `bg-*` (크로마키 없음, 풀블리드)

manifest 실치수는 **360×470**(`anchor: topleft`, `align: bottom` — 화면 하단에 붙는다), 위쪽 `bg-zone-*` 항목들의 360×640이 아니다.
QA 발견 E-1(스카이라인만 있고 상단 2/3이 완전히 빈 하늘) 대응: 이번 프롬프트는 상단까지 옅은 밀도로 시각 요소를 채우되
**획은 가늘게, 채도는 최저로, 레인 중심부는 비워서** 낙하물 판독성을 지키라고 각각 명시했다.
`bg-europe`/`bg-asia`/`bg-eastasia`/`bg-modern`은 위 `bg-zone-0`~`3`을 지역 톤은 유지한 채 상단 보강만 다시 그린 것이다.

---

### player

```json
{
  "id": "player",
  "filename": "char/player.png",
  "size": "2024x240 (4배 생성 → 506x60 축소, 46x60 셀 11칸)",
  "common": true,
  "prompt": "Subject: character sprite sheet of a faceless stickman for a game engine — NOT a poster, a literal frame strip. Plain circle head with NO face at all — no eyes, no mouth, nothing. Single-line torso, single-line limbs with simple joint bends. Thin blade as one straight line with a tiny circle for the grip. Layout: ELEVEN poses in one horizontal row, side view facing RIGHT, ALL AT IDENTICAL SCALE ON ONE SHARED GROUND LINE (draw it as one continuous hairline under every cell, including the airborne ones), evenly spaced into eleven equal cells, each figure small with clear empty ivory margin inside its cell. No numbers, no labels, no dividers between cells. In this exact left-to-right order: 1 IDLE — standing upright, feet slightly apart, blade hanging straight down at his side. 2 JUMP — airborne above the ground line, both knees tucked toward the torso, blade trailing behind at hip height. 3 ATTACK WIND-UP — torso leaning back slightly, sword arm raised so the blade points up past his head, off-hand out for balance, NO trail yet. 4 ATTACK HIT — deep forward lunge, front knee bent, back leg fully extended behind him, blade swept low and through at front-leg height; this is the FIRST of only two cells allowed a single sweeping yellow #FFD200 arc trailing from the blade tip. 5 ATTACK RECOVERY — the same deep lunge held, blade fully lowered at the end of its swing, no trail, stillness. 6 GUARD GROUND — standing planted with feet apart, both arms spread outward and up so they do NOT cross the head circle, blade held perfectly horizontal above his head. 7 GUARD AIR — airborne above the ground line, knees tucked up sharper and higher than the JUMP pose (a visibly different silhouette), same horizontal-blade-overhead guard. 8 GUARD BREAK — head and torso tipped backward off balance, one leg forward one back, both arms flung wide open, blade tipping loosely behind him as if about to slip from his grip. 9 SPECIAL — the deepest two-handed lunge of the set, both hands together low on the grip, blade swept far past his leg; this is the SECOND and only other cell allowed yellow — ONE large diagonal yellow #FFD200 slash stroke crossing corner to corner of the whole cell, bigger and bolder than cell 4's small arc but the exact same ink weight and color. 10 PINNED — squashed low near the ground line, body compressed into a low horizontal line, limbs splayed out sideways symmetrically on both sides, head compressed near the top of the flattened silhouette. 11 DEAD — reclining diagonally on his back near the ground line, head tilted to one side, limbs limp and asymmetric — its silhouette must read as clearly different from PINNED even in solid black. Silhouette of every cell must stay readable when shrunk to 50 pixels tall. No clothing, no hair, no facial features, no yellow anywhere except the two named cells, no cyan, no red, no UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, numbers, labels, dividers, watermark, facial features, eyes, mouth, clothing, hair, different scale per pose, different ground heights, missing ground line under airborne poses, cyan, red fill, third yellow location, ivory-colored highlights inside the figure, background color other than flat #F4F1E8",
  "notes": "PLAYER_SHEET 11칸 순서 그대로: idle/jump/attack0/attack1/attack2/guardG/guardA/guardBreak/special/pinned/dead. ★기존 stick-poses-8 문서는 '필살엔 노랑 없음'이라 썼지만 sprites.ts의 buildSpecial()이 실제로 대각선 노란 참격을 그린다 — 이 슬롯이 정본, 그 서술은 이 파일 기준 오류. attack1과 special 두 칸만 yellow accent(작은 호 vs 큰 대각선)."
}
```

---

### boss

```json
{
  "id": "boss",
  "filename": "char/boss.png",
  "size": "1280x256 (4배 생성 → 320x64 축소, 80x64 셀 4칸)",
  "common": true,
  "prompt": "Subject: boss sprite sheet — a surveillance satellite-moon, drawn as a perfect thin-line circle with a few small crater circles inside (line only, no fill) and short straight antenna stubs on the rim. Layout: FOUR states in one horizontal row, IDENTICAL SCALE, IDENTICAL CENTER HEIGHT, evenly spaced, generous ivory margin in each cell, no numbers or labels. Left to right: 1 IDLE — the calm base moon exactly as described, one crater filled solid yellow #FFD200 as its mechanical lens iris (the only yellow in this cell), antennas straight and even. 2 CHARGING — the same moon leaning very slightly toward the direction of motion, with three or four short parallel yellow #FFD200 speed-line ticks trailing off its back rim suggesting a forward charge; iris still solid yellow. 3 STAGGER — the same moon with several short yellow #FFD200 tick-marks radiating outward from the rim at uneven angles like a spark burst, one antenna bent as if struck, iris still yellow. 4 DEFEATED — the same moon but its iris crater is now drawn EMPTY (thin line only, unfilled — powered down, no yellow left anywhere in this cell), one antenna drooping, two or three thin unfilled smoke-curl hairlines drifting up and away from the rim. No face, no mouth, no rabbit, no expression, no crater shading, no engines, no flames. Absurd rather than menacing throughout — a moon that happens to be watching you. No UI chrome. Every cell readable when shrunk to 64 pixels wide.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, numbers, labels, watermark, face, mouth, eyes besides the iris, rabbit, expression, crater shading, engines, flames, blue solar panels, red fill, different scale per cell, ivory-colored highlights inside the moon",
  "notes": "BOSS_SHEET 4칸 순서: idle/charging/stagger/defeated. sprites.ts 코드 기준(추진 틱·스파크 방사·연기+홍채 소등)으로 상태를 구분했다 — 원作 코드의 빨강 불꽃(추진)은 팔레트 규칙상 노랑 틱으로 대체."
}
```

---

### 엔티티 — 낙하/투사 위험물

`ent-bolt`/`ent-boltCue`는 순수 잉크 지그재그(기존 코드의 청록 `#29E0E6`은 새 팔레트에 없는 색이라 폐기).
`ent-shotOk`/`ent-shotNo`는 **색이 아니라 모양**으로 가른다(색약 안전 규칙 — 하나는 속이 빈 고리, 하나는 속을 채운 원+가시).

### ent-bolt

```json
{
  "id": "ent-bolt",
  "filename": "char/bolt.png",
  "size": "48x160 (4배 생성 → 12x40 축소)",
  "common": true,
  "prompt": "Subject: a single falling lightning bolt, drawn as one continuous jagged zigzag ink line — sharp angular turns, no curves, no fill inside the zigzag (it reads as a hairpin line shape, not a solid lightning-bolt icon silhouette). Thin even-weight black #1A1A20 stroke only, no yellow, no color. Tall and narrow, filling most of the frame height with a small ivory margin top and bottom. No motion blur, no glow, no spark burst around it — just the bare zigzag line. Centered. No UI chrome. Must read clearly even at 12x40 pixels.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, yellow fill, cyan, glow, motion blur, filled lightning-bolt icon, rounded curves, second color",
  "notes": "2막 낙뢰 낙하물. 기존 청록 채움 아이콘 대신 순수 잉크 지그재그 선으로 재작업(팔레트에 청록 없음)."
}
```

### ent-boltCue

```json
{
  "id": "ent-boltCue",
  "filename": "char/bolt-cue.png",
  "size": "48x48 (4배 생성 → 12x12 축소)",
  "common": true,
  "prompt": "Subject: a tiny warning forecast mark — a miniature version of a jagged lightning zigzag, drawn as one continuous angular ink line, thin even-weight black #1A1A20 stroke, no fill, no color, no glow, no burst rays around it. Small, centered, square canvas, generous ivory margin. It must read as an unmistakable 'something is about to fall here' glyph even shrunk to 12x12 pixels — keep the zigzag bold in shape even though the stroke stays thin. No UI chrome, no ring, no exclamation mark, no text.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, exclamation mark, watermark, yellow fill, cyan, glow, burst rays, ring, filled icon",
  "notes": "낙뢰 낙하 예고(레인 위 표시). ent-bolt의 축소판 지그재그, 색 없음."
}
```

### ent-rock

```json
{
  "id": "ent-rock",
  "filename": "char/rock.png",
  "size": "96x80 (4배 생성 → 24x20 축소)",
  "common": true,
  "prompt": "Subject: a single loose chunk of falling rubble — an irregular jagged-edged block, NOT a rectangle, outlined in thin black ink and filled with one muted dusty grey-brown tone (from the desaturated #B9B3A6 / #948E82 / #6E695F family), flat fill, no gradient. One thin crack hairline runs across the face. No eyes, no face, no comic expression — this is debris, not a character. Wide-ish squat proportions. Centered on ivory with generous margin. No dust cloud around it, no motion lines, no color beyond the one dusty fill. No UI chrome. Must read at 24x20 pixels.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, face, eyes, comic expression, rectangle shape, saturated color, dust cloud, motion lines, second fill color",
  "notes": "2막 낙석. ★기존 sprites.ts buildRockIcon()는 눈 2개(코믹 암석)를 그렸지만 ART_DIRECTION 무표정 원칙상 이번 재작업에서 얼굴 제거."
}
```

### ent-shotOk

```json
{
  "id": "ent-shotOk",
  "filename": "char/shot-ok.png",
  "size": "64x40 (4배 생성 → 16x10 축소)",
  "common": true,
  "prompt": "Subject: a small guardable projectile — a HOLLOW ring, drawn as a thin even-weight black #1A1A20 circle outline with an empty ivory center (no fill inside the ring), plus a short simple line tail trailing from one side suggesting motion. No color, no yellow, no fill. Small, wide-short frame, generous ivory margin, tail pointing left. The open/hollow silhouette is the entire signal that this one is safe to guard — it must read as visibly different in shape from a solid filled circle even at 16x10 pixels. No UI chrome, no text, no color coding.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, filled circle, spikes, yellow, cyan, red, color-only distinction",
  "notes": "가드/캔슬 가능한 탄. 색이 아니라 '속이 빈 고리'로 구분(ent-shotNo와 짝, 색약 안전)."
}
```

### ent-shotNo

```json
{
  "id": "ent-shotNo",
  "filename": "char/shot-no.png",
  "size": "64x40 (4배 생성 → 16x10 축소)",
  "common": true,
  "prompt": "Subject: a small unguardable projectile that must be dodged, not blocked — a SOLID FILLED ink circle (filled flat black #1A1A20, no gradient) with a few short spike ticks radiating from its rim making the silhouette visibly spikier and denser than a plain circle, plus a short simple line tail trailing from one side suggesting motion. No color, no yellow, no red — the danger signal is shape density alone (solid + spiky), not color. Small, wide-short frame, generous ivory margin, tail pointing left. Must read as clearly different from a hollow ring even at 16x10 pixels. No UI chrome, no text.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, hollow ring, yellow, cyan, red, color-only distinction, smooth circle without spikes",
  "notes": "가드 불가·회피 전용 탄. 속을 채운 원+가시 실루엣으로 ent-shotOk와 구분(색 아님)."
}
```

### ent-rabbit

```json
{
  "id": "ent-rabbit",
  "filename": "char/rabbit.png",
  "size": "112x80 (4배 생성 → 28x20 축소)",
  "common": true,
  "prompt": "Subject: a small scout DRONE — this is a MACHINE, not an animal. A compact rectangular body block, thin black ink outline, filled with a muted dusty grey-brown tone (from the desaturated dust family, flat fill, no gradient). Two short straight HORIZONTAL propeller-arm ticks project from the upper left and right corners of the body, lying flat and low like tiny wings/rotor arms — they must read as mechanical rotor stubs, absolutely not as upright ears. One small round lens on the underside of the body, filled solid yellow #FFD200 (the only yellow in the image) — echo the same 'mechanical eye' motif as the boss moon's iris, since this drone is the boss's remote scout. No face, no fur, no whiskers, no soft rounded animal head, no long ears, nothing cute. Centered, wide-short proportions, generous ivory margin. No UI chrome. Must read as clearly a machine at 28x20 pixels.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, rabbit, bunny, animal, fur, whiskers, long upright ears, cute face, eyes besides the one lens, red, cyan, second yellow",
  "notes": "★팀장 명시 지시: manifest 키 이름은 rabbit이지만 실제로는 정찰 드론이다(sprites.ts buildRabbitIcon도 드론 몸통+프로펠러로 그림). 토끼 금지, 안테나를 귀처럼 세우지 않는다. 렌즈 노랑은 보름호 홍채와 같은 모티프."
}
```

### ent-cannon

```json
{
  "id": "ent-cannon",
  "filename": "char/cannon.png",
  "size": "96x112 (4배 생성 → 24x28 축소)",
  "common": true,
  "prompt": "Subject: a small fixed turret mounted at the top of the field, aiming straight down. A wide low mount base and a narrower straight barrel rising from its center, both drawn as thin black ink outlines filled with a muted dusty grey-brown tone (flat fill, no gradient, no rust orange). No face, no crosshair, no yellow, no color beyond the one dusty fill — this is inert hardware, its aim-warning is a separate cue asset, not baked into this sprite. Centered, tall-ish proportions, generous ivory margin, no UI chrome, no scaffolding around it. Must read as a simple gun mount at 24x28 pixels.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, face, crosshair, yellow, red, rust orange, muzzle flash, saturated color",
  "notes": "특별작전 고정 포탑(위에서 아래로 조준). 조준 예고는 ent-boltCue 재사용이라 이 스프라이트엔 강조색 없음."
}
```

---

### fx-hit

```json
{
  "id": "fx-hit",
  "filename": "fx/hit.png",
  "size": "288x96 (4배 생성 → 72x24 축소, 24x24 셀 3칸)",
  "common": true,
  "prompt": "Subject: a generic impact-spark burst, 3-frame animation strip, IDENTICAL SCALE, IDENTICAL CENTER, evenly spaced into three equal cells, thin black #1A1A20 ink strokes only — NO yellow, no color, this is a plain hit spark not a special move. Frame 1: a small tight burst of four or five short radiating tick marks close to the center. Frame 2: the same radiating ticks extended further outward and slightly longer, peak of the burst. Frame 3: the ticks thinned and faded further out, sparse remnants, burst dissipating. No ring, no shockwave circle, no debris chunks, no fill anywhere, no yellow. Generous ivory margin around each cell. No UI chrome, no numbers. Must read at 24x24 pixels per cell.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, numbers, watermark, yellow, color, filled shockwave ring, debris chunks, different scale per frame",
  "notes": "일반 타격 스파크(effects.ts burst('hit') = PALETTE.INK, 색 없음). 3프레임=작게→크게→흐려짐."
}
```

### fx-slash

```json
{
  "id": "fx-slash",
  "filename": "fx/slash.png",
  "size": "192x192 (4배 생성 → 48x48 축소)",
  "common": true,
  "prompt": "Subject: a single diagonal sword-slash whoosh mark, standalone VFX. One bold sweeping yellow #FFD200 ink stroke running corner to corner (upper-left to lower-right), even-weight with rounded caps, plus two or three much thinner, shorter companion lines running parallel just beside the main stroke to suggest motion trail — those companion lines are also yellow, thinner and fainter, not a second color. That is the only yellow in the image; nothing else is drawn. No burst, no sparks, no debris, no character, no ring. Centered on ivory with generous margin. No UI chrome. Must read clearly at 48x48 pixels.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, character, burst, sparks, debris, second color, ring, curved slash",
  "notes": "일반 참격 궤적 단독 VFX(effects.ts slashColor = PALETTE.YELLOW 재사용)."
}
```

---

### 배경 — 실제 로드 슬롯 (360x470)

`bg-europe`/`bg-asia`/`bg-eastasia`/`bg-modern`은 지역 톤은 위 `bg-zone-0`~`3`을 유지하되, QA E-1(빈 상단) 보강판이다.
`bg-act2`/`bg-bonus`/`bg-moon`은 이 파일 최초 등장 — 각각 2막 폐허 톤, 버터 보너스, 최종 달 대치 배경이다.

### bg-europe

```json
{
  "id": "bg-europe",
  "filename": "bg/europe.png",
  "size": "360x470",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x470. A distant European stone skyline along the very bottom edge — limestone rooftops, low cornices, a broken pediment, two or three arched window holes, a colonnade suggested by three vertical strokes, a water tank, a stub antenna, thin black outlines with NO fill, one continuous pen contour, occupying only the bottom 15 percent of the frame. Above that, per QA note E-1, do NOT leave the sky totally empty: add a very sparse hint of a distant bell-tower or spire silhouette rising a little higher than the rest of the skyline near one side of the frame (thin unfilled line, fading thinner toward its tip), plus one or two extremely faint, extremely thin horizontal cloud-line strokes drifting near the top edge. Keep every added mark near the left or right third and far from the vertical center strip where falling objects read, so gameplay stays legible — the added marks must be so sparse and light that the frame still feels mostly empty. No saturation anywhere, no navy, no sun, no stars, no yellow, no birds, no gradient wash. No characters. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, dense clouds, sun, stars, navy sky, yellow accent, saturated building colors, marks in the center lane column, busy sky",
  "notes": "1막 유럽 서쪽 회랑. bg-zone-0 대체 + 상단 스파이어 실루엣·옅은 구름선 보강(E-1)."
}
```

### bg-asia

```json
{
  "id": "bg-asia",
  "filename": "bg/asia.png",
  "size": "360x470",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x470. A distant Asian market skyline along the very bottom edge — low flat stall roofs, a few lattice window grids as tiny hash marks, a scaffold suggestion of two or three verticals, a market awning as a simple triangle stroke, a crooked chimney, thin black outlines with NO fill, occupying only the bottom 15 percent of the frame. Per QA note E-1, add sparse life higher up: one or two tiny kite silhouettes (a small diamond outline on a thin string line) floating high near one side, and a couple of extremely small, sparse bird-V hairline marks even higher. Keep every added mark near the left or right third, well clear of the vertical center strip where falling objects read, and keep them very thin and very sparse so the frame still reads as mostly empty. No fog wash, no mist, no color, no navy, no yellow, no gradient. No characters, no crowds, no signage, no text. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, crowds, signage, fog wash, navy sky, yellow accent, marks in the center lane column, busy sky, dense kites",
  "notes": "1막 강턱 시장. bg-zone-1 대체 + 상단 연·새 실루엣 보강(E-1)."
}
```

### bg-eastasia

```json
{
  "id": "bg-eastasia",
  "filename": "bg/eastasia.png",
  "size": "360x470",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x470. A distant East-Asian tiled-roof skyline along the very bottom edge — wooden houses with gentle curved eaves, overlapping roof waves as a few scalloped strokes, a chimney, a stone lantern as two tiny stacked rectangles, thin black outlines with NO fill, occupying only the bottom 15 percent of the frame. Per QA note E-1, add sparse depth higher up: one faint, single-contour distant hill-ridge silhouette partway up the frame (thin unfilled line, no texture, spanning quietly behind), and one or two very sparse, very thin horizontal cloud strokes higher still. Keep everything extremely light-weight and clear of the vertical center strip where falling objects read. No bright paint, no vermilion, no saturated wood brown, no moon, no yellow, no gradient. No characters, no cherry blossoms, no calligraphy. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, cherry blossoms, calligraphy, moon, navy sky, yellow accent, vermilion, marks in the center lane column, busy sky",
  "notes": "1막 기와능선. bg-zone-2 대체 + 상단 능선 실루엣·옅은 구름선 보강(E-1)."
}
```

### bg-modern

```json
{
  "id": "bg-modern",
  "filename": "bg/modern.png",
  "size": "360x470",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x470. A distant modern rebar/glass-alley skyline along the very bottom edge — unfinished concrete slab rectangles, a few curtain-wall grid fragments as tiny window ticks, a water tank, thin black outlines with NO fill, occupying only the bottom 15 percent of the frame. Per QA note E-1, add sparse structure higher up: a single thin construction-crane jib line reaching further up into the frame than the rest of the skyline (one continuous hairline with a small hook tick at the end, no fill), and one or two faint distant tower-stub outlines partway up (short unfilled rectangles, thin line only, no windows drawn on them, fading thinner). Keep every added mark near the left or right third, clear of the vertical center strip where falling objects read. No ocean fill, no waves, no blue, no cyan glass, no reflections, no navy, no yellow, no aircraft. No characters, no cars. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, cars, cyan glass, reflections, ocean fill, navy sky, yellow accent, marks in the center lane column, busy sky, filled crane",
  "notes": "특별작전 유리 골목/철근 해안. bg-zone-3/4 톤 통합 대체 + 상단 크레인·타워 실루엣 보강(E-1)."
}
```

### bg-act2

```json
{
  "id": "bg-act2",
  "filename": "bg/act2.png",
  "size": "360x470",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x470, act-2 ruined-cathedral dusk tone. The sky stays clearly bright and warm — a slightly duskier ivory than the default (approximately #EBE6DC, never dark, never navy, never black). Along the very bottom edge only, a ruined cathedral/tower skyline in thin black outline with NO fill: broken columns, a shattered rose-window circle drawn as a bare ring with a couple of missing wedge lines, a few exposed rebar ticks, occupying only the bottom 15 percent of the frame. Rising from that ruin, ONE tall broken tower or spire silhouette continues noticeably higher up into the frame than everything else — thin unfilled line, getting fainter and thinner toward its jagged broken top, positioned off-center so it never crosses the middle lane column. A few sparse dust-mote ink flecks (tiny short ticks) drift near it. No moon here (the moon is its own background). No stars, no color, no yellow, no gradient wash. No characters. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, moon, stars, navy sky, black sky, yellow accent, marks in the center lane column, dense rubble texture",
  "notes": "2막 대성당/탑 폐허 던전(act2.ts phase: cathedral→tower). 황혼 톤은 bg-zone-6의 #EBE6DC 절제 원칙 재사용, 밝기는 유지."
}
```

### bg-bonus

```json
{
  "id": "bg-bonus",
  "filename": "bg/bonus.png",
  "size": "360x470",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x470, butter-bonus-round pastel tone. The base field is a warmer, creamier version of the default ivory (a soft pale butter-cream, still clearly in the ivory family, NOT yellow #FFD200 itself — reserve that hue for the gameplay butter object, not this backdrop). Along the very bottom edge, replace the usual hard-edged city skyline with a few soft ROUNDED silhouette shapes — like rounded shelf edges or soft loaf-like humps, thin black outline only, no fill, corners noticeably rounded rather than sharp, echoing 'soft' rather than 'hard construction'. Because this is a tonal breather stage, let two or three soft rounded cloud-puff outlines (thin line, unfilled, gently rounded rather than jagged) drift a bit higher into the frame than in the other zones, still sparse and light, still clear of the vertical center strip. No yellow anywhere in this image, no gradient, no saturated color. No characters. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, yellow fill, saturated pastel color, sharp hard skyline, marks in the center lane column, busy sky",
  "notes": "보너스(버터) 라운드 배경(building.ts STACK.BUTTER_G/VTERM, s.mode==='bonus'). 부드러운 톤·둥근 실루엣만, 노랑은 버터 오브젝트 몫이라 배경엔 안 씀."
}
```

### bg-moon

```json
{
  "id": "bg-moon",
  "filename": "bg/moon.png",
  "size": "360x470",
  "common": true,
  "prompt": "Subject: vertical mobile-game background, 360x470, final moon-confrontation stage — looking up from a rooftop toward the sky where the boss lives, but the actual boss moon disk is a SEPARATE sprite drawn on top of this background at runtime, so DO NOT draw a large moon circle here (that would duplicate it). The sky stays clearly bright ivory, never navy, never outer space. Along the very bottom edge only, a ripped-open rooftop/ruin skyline in thin black outline with NO fill — sheared floor plates, a broken railing, occupying only the bottom 15 percent of the frame. In the upper portion, per QA note E-1, add only very small, very sparse marks: two or three tiny thin-ring unfilled circles of different small sizes drifting near the top third, read as loose broken satellite debris fragments (not a second moon, not craters on a disk — separate free-floating small rings), plus a scattering of a few pinprick-sized ink dot flecks even higher, extremely sparse, like distant grit rather than stars. No yellow anywhere in this background. No planet Earth, no spacecraft, no atmosphere band, no gradient. No characters. No UI chrome.",
  "negative": "pixel art, photorealism, thick outlines, gradients, texture, UI chrome, HUD, text, watermark, characters, large moon disk, duplicate boss, outer space, navy sky, starfield, planet Earth, spacecraft, yellow accent, marks in the center lane column",
  "notes": "최종 달(보름호) 대치 무대. 달 본체는 boss.png가 별도로 그리므로 배경에 큰 달 원반 중복 금지 — 파편 조각(작은 고리)만."
}
```
