# 건뿌 아트 디렉션 & 이미지 프롬프트

> 정본 기준: IMAGE 채널에서 사용자가 실제로 내린 지시 3연타 —
> **"밝은 배경, 졸라맨, 얇은 선."** → **"건물 원색 빼고 먼지 톤."**
> `geonppu-stickman.png`가 방향 정본. 도깨비 픽셀아트(`geonppu-ppuppu.png`)와
> 원색 블록 스택, 실사 옥상 사진(`korea-stage`)은 **전부 폐기**.

---

## 1. 컨셉 한 문장

> **아무것도 아닌 졸라맨이, 아무 설명 없이, 세계의 건물을 위에서부터 벤다.**

### 왜 이 방향이 맞나
- 게임오버 문구 `철거 실패 / 건물주가 당신을 고소했습니다` 의 건조한 개그와 라인아트의 무표정이 정확히 같은 톤이다.
- 캐릭터가 화려할수록 이 농담이 죽는다. **주인공은 존재감이 없어야 웃기다.**
- 46×55px에서 픽셀 도깨비는 뭉개지지만, 선 그림은 **작을수록 오히려 또렷하다.**
- `sprites.ts`가 이미 도형을 코드로 그리는 구조다. 선+원 조합은 **PNG 파이프라인 없이 지금 구조로 바로 구현된다.** (이미지 로더 추가 불필요 → 불변규칙 6 유지)

### 절대 금지 (이미 한 번씩 밟은 지뢰)
- 픽셀아트 / 도트 / 16비트 룩
- 캐릭터 얼굴·표정·의상 디테일 (졸라맨은 **동그라미 하나에 이목구비 없음**)
- 원색으로 칠한 건물 블록 (빨강·파랑·노랑 알록달록 = 폐기 사유)
- 실사·사진·시네마틱
- 두꺼운 아웃라인, 그림자, 그라데이션, 질감

---

## 2. 스타일 스펙

### 팔레트 — 밝은 테마로 반전
현재 게임은 배경이 짙은 남색(`#0D1330`)이다. **이 방향으로 가려면 반전해야 한다.**

```
배경   #F4F1E8   아이보리 (화면 전체의 기본 바닥)
선     #1A1A20   거의 검정 (졸라맨, 건물 윤곽, 모든 획)
강조   #FFD200   노랑 (참격 궤적, 필살, 버터 — 화면에서 유일하게 채도 높은 색)
경고   #E5302E   빨강 (피격·실패에만. 아껴 쓸수록 강해짐)
먼지   #B9B3A6 / #948E82 / #6E695F   건물 면 (저채도 회갈색 3단만)
```

> 먼지 톤은 **채도를 거의 0에 가깝게**. 건물이 색으로 튀면 안 되고,
> 등급 구분은 **선의 밀도와 창 모양**으로 한다(색약 안전 3중 부호화 규칙 유지).

### 선
- 굵기 균일한 얇은 획. 손으로 그은 듯 미세하게 흔들리되 러프하진 않게
- 끝처리 둥글게(round cap), 모서리 각지지 않게
- **선 하나를 뺄 수 있으면 뺀다.** 이 스타일의 완성도는 뺀 선의 개수로 결정된다

### 여백
`geonppu-stickman.png`가 정답인 이유가 여백이다. 캐릭터가 화면의 20%도 안 차지한다.
게임 화면에서도 마찬가지 — 낙하하는 건물과 졸라맨 사이의 **빈 아이보리 공간이 긴장을 만든다.**

---

## 3. 이미지 프롬프트 세트

> 사용법: `[공통]` 블록을 매 프롬프트 앞에 그대로 붙인다.

### [공통] — 매번 복붙
```
Minimal line art. Thin, even-weight black ink strokes (#1A1A20) with rounded caps,
drawn with a slight hand-drawn wobble but never rough or sketchy.
Flat warm ivory background #F4F1E8, completely untextured.
Only one accent color allowed: yellow #FFD200.
No shading, no gradients, no drop shadows, no outlines thicker than the stroke itself,
no texture, no pixel art, no photographic elements.
Generous empty space — the drawing occupies a small part of the frame.
Deadpan and quiet. No text, no logo, no watermark, no UI.
```

---

### A. 졸라맨 포즈 시트 (최우선 — 이게 나와야 나머지가 정해진다)

```
[공통]

Subject: A stick figure. Plain circle for a head with NO face at all — no eyes,
no mouth, nothing. Single-line torso, single-line limbs with simple joint bends.
He carries a thin blade drawn as one straight line with a tiny circle for the grip.

Layout: character sheet, 6 poses in one horizontal row, side view facing right,
ALL AT IDENTICAL SCALE ON ONE SHARED GROUND LINE, evenly spaced:
1. IDLE — standing upright, blade lowered at his side, relaxed
2. ATTACK — deep forward lunge, blade swung down and through, trailing a single
   sweeping yellow #FFD200 arc behind the blade
3. GUARD — blade raised horizontally above the head with both arms, knees bent, bracing
4. JUMP — airborne, both knees tucked up, blade trailing behind
5. PINNED — flattened flat on the ground, limbs splayed out sideways
6. DEAD — collapsed on his back, limbs limp

The yellow arc appears ONLY in the ATTACK pose. Every other pose is pure black line.
Each figure must be small within its cell with clear empty space around it.
Silhouette must stay readable when shrunk to 50 pixels tall.
```

**왜 이렇게 쓰나**: 게임이 필요한 건 46×55px 프레임 10종이다. `IDENTICAL SCALE ON ONE
SHARED GROUND LINE`을 대문자로 강제하지 않으면 포즈마다 크기·발높이가 달라져 잘라도 못 쓴다.
`geonppu-stickman.png`는 이 조건 없이 1포즈만 나온 상태다.

---

### B. 건물 층 — 먼지 톤 라인 (원색 폐기 후 재작업)

```
[공통]

Subject: A single floor of a building, drawn straight-on with no perspective —
a wide flat rectangle outlined in thin black line, filled with a muted dusty
grey-brown (nearly desaturated). Windows drawn as simple thin-line rectangles.

Three variants stacked vertically in one image, same width, same line weight:
TOP    — plain face, two square windows, no other detail
MIDDLE — same face with evenly spaced horizontal joint lines, four arched-top windows
BOTTOM — same face with a dense grid of joint lines, six narrow vertical slit windows

The three must be distinguishable in pure greyscale by window shape and line density
alone — NOT by color. Fills stay dull and close in value; nothing saturated,
nothing bright. Wide short proportions. Each tiles seamlessly left to right.
```

---

### C. 배경 — 밝은 원경

```
[공통]

Subject: Vertical game background. A distant city skyline along the very bottom edge,
drawn as thin black outlines only with no fill — just the contour of rooftops,
water tanks, and antennas, like a single continuous pen line across the horizon.
Everything above the skyline is empty ivory.

Composition: skyline occupies only the bottom 15% of the frame. The upper 85%
is completely empty ivory — no clouds, no sun, no stars, no gradient.
Tall vertical aspect ratio.

This is a background that must disappear behind gameplay. If it draws attention,
it is wrong.
```

**왜 이렇게 쓰나**: 이전 시도들이 전부 배경을 주인공으로 만들어서 폐기됐다.
(밤하늘 별, 파스텔 아파트, 실사 구름) 이 스타일에서 배경의 정답은 **거의 아무것도 없음**이다.

---

### D. 달 보스 "보름호"

```
[공통]

Subject: A perfect circle drawn in thin black line — the moon. A few small
circles inside it for craters, also thin line only, no fill. One of those circles
is different: it is a mechanical lens iris, and it is filled solid yellow #FFD200.
A few short straight antenna lines project from the circle's rim.

Centered, square aspect, large in frame but with clear empty margin.
Absurd rather than menacing — it is a moon that happens to be watching you.
No face, no expression.
```

---

### E. 버터바

```
[공통]

Subject: A single rectangular slab of butter, drawn straight-on as a thin-line
rectangle with slightly rounded corners, filled flat yellow #FFD200.
A thin line near the top edge suggests a peeled wrapper. Nothing else.

Wide short proportions, single object, centered, lots of empty ivory around it.
It must read as SOFT while every building block in this game reads as HARD —
achieve that only through the corner rounding, not through shading.
```

---

### F. 타이틀 키 비주얼

```
[공통]

Subject: Vertical title art. A tiny stick figure stands at the bottom center,
seen from behind, blade in hand, head tilted up. Far above him, a towering stack
of building floors recedes upward and out of the top of the frame, drawn in thin
line with muted dusty fills, getting smaller and fainter toward the top.
A single thin-line circle — the moon, with one small solid yellow dot inside it —
sits near the very top.

Tall vertical aspect. The figure is almost comically small against the stack.
Keep the upper quarter sparse; a title will be placed there.
No heroic posing. He is just a guy looking up at a very tall problem.
```

---

## 4. 이 방향으로 갈 때 코드에서 바뀌어야 하는 것

이건 아트만의 문제가 아니다. **밝은 테마 반전은 게임 코드 변경을 요구한다.**

| 항목 | 현재 | 필요 | 위치 |
|---|---|---|---|
| 배경색 | `#0D1330` 짙은 남색 | 아이보리 `#F4F1E8` | `config.ts` PALETTE.BG |
| 건물 색 테이블 | 테마 4종 × 등급 3종 채색 | 먼지톤 3단 + 선 윤곽 | `sprites.ts` THEME_TIERS |
| 캐릭터 | 사각형 블록 조합(몸통/팔/다리/머리) | 선 + 원 조합 | `sprites.ts` buildIdle 등 10종 |
| HUD | 밝은 글자 on 어두운 배경 | 어두운 글자 on 밝은 배경 | `renderer.ts` |
| 화면 플래시 | 밝은 플래시 | 어두운 플래시로 반전 | `renderer.ts` flashColor |

**주의 — 순서 문제**: 지금 `게임 출시` 그룹은 **손맛 갭 한 장씩** 처리 중이고
(현재 공중가드 바운스), PROMPT 지시서에 `스프라이트 교체 없음`이 명시돼 있다.
아트 전환은 손맛 확정 **후**에 하는 게 맞다. 지금 스프라이트를 갈아엎으면
"원본이랑 나란히 연타" 비교 기준이 흔들린다.

**다만 배경색 반전 한 가지만은 먼저 해도 된다.** 건물 색이 눈아프다는 문제
(`IMAGE` 채널 12:13 지시)의 진짜 원인이 어두운 배경 위 채도 높은 건물 대비이기 때문이다.

---

## 5. IMAGE 봇에 지시할 때 규칙

1. `[공통]` 블록을 **매번** 앞에 붙인다 — 톤 일관성이 전부 여기서 나온다
2. 세로 화면 게임이다. 배경·타이틀은 **세로**로 뽑는다 (지금까지 전부 가로로 나왔다)
3. 한 번에 한 종류만
4. 캐릭터 시트는 `IDENTICAL SCALE / SHARED GROUND LINE`을 반드시 대문자로 강제
5. 결과는 **360×640 화면에 축소해 올려놓고** 판단한다. 크게 보면 다 괜찮아 보인다
6. 노랑은 화면에 **한 곳만**. 두 곳 이상 노랑이면 강조가 죽는다
