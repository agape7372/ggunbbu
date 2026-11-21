# 이펙트 제작 하네스 (2026-11-22)

무기 · 필살 이펙트를 만들고 고칠 때 쓰는 도구와 순서. 그림 규칙의 정본은 `CLAUDE.md` 불변 13 · `docs/INK_FX_2026-11-01.md`이고, 이 문서는 **어떻게 만들고 판정하나**만 다룬다.
만드는 순서(관문 열 · 모션 문법 · 증상 → 처방)의 정본은 Game-studio 스킬 `gs-fx-loop`(`코딩\Game-studio\.claude\skills\gs-fx-loop\SKILL.md`)이다. 이펙트 작업은 그 스킬을 먼저 읽고 시작한다.

## 1. 왜 만들었나

- 11-01~11-22 이펙트 회차 열한 번. 캡처 스크립트 22벌이 git 밖 `tmp/`(워크트리 다섯 곳)에 흩어져 회차마다 복사해 고쳐 썼다(가짜 시계 + 틱 루프 여덟 번 복붙 · 포트 하드코딩 · 사람이 개발 서버를 먼저 켬).
- 무기마다 · 판마다 워크트리를 팠다(`w2-*` 8 · `w3-*` 6 · `w4-*` 7).
- 심사가 전부 정지 캡처였다. 박자 문제(「기계적으로보여」 · 「타격감없이 매끄럽기만함」)는 매번 사용자 판정에서 나왔다.
- 캡처 실행은 원래 빨랐다(시트 15칸 9.8초). 느린 건 도구를 다시 짜고, 시안 없이 코드까지 지은 뒤 반려받는 일이었다.

## 2. 도구 — `scripts/fx/fx.mjs`

개발 서버는 스스로 띄우고 닫는다(5300부터 빈 포트 · HMR 끔). 어디서 불러도 레포 루트를 찾는다.
Playwright는 레포에 없다(불변 6). `--playwright-module <폴더>`나 환경 변수 `PLAYWRIGHT_MODULE`로 준다. 이 PC = `C:/Users/agape/Desktop/코딩/motion-studio/node_modules/playwright`.

| 명령 | 내는 것 | 쓸 때 |
|---|---|---|
| `sheet` | 장면마다 PNG 한 장. 줄 = 무기, 칸 = 사건 뒤 틱. `--scale 1` = 폰 1배 · `--gray` = 흑백 | 꼴 · 크기 · 무기끼리 갈리는지 |
| `strip` | 연속 프레임 띠 + 줄마다 계측 띠 + `motion.json`. `--frames N` · `--every K` · `--cols N`(한 줄 칸 수 · 기본 8) | **박자 판정**. 정지 시트로 박자를 넘기지 않는다 |
| `serve` | 서버 + 브라우저를 띄워 둔다(주소는 `tmp/fx/.server`). 떠 있으면 다른 명령이 그걸 쓴다 | 한 회차에 여러 번 뽑을 때. 새로 띄우면 약 30초 · 떠 있으면 한 번에 2~8초 |
| `movie` | `<무기>.mp4`(제 속도) · `<무기>-slow.mp4`(0.3배속). `--waza <id>`면 필살까지 | 사용자 판정 · 마지막 확인 |

공통 인자: `--weapons a,b` · `--scenes hit,floor,destroy,whiff,aura,special` · `--out <폴더>`(기본 `tmp/fx/out`) · `--draft <파일>[,…]`.
인자 없이 부르면 사용법이 나온다. 페이지 쪽 코드(가짜 시계 · 장면 사전 · 크롭 · 시트 · 계측)는 `scripts/fx/page.ts` 한 벌이고 `tsc`가 같이 본다.

같은 인자면 같은 그림이 나온다(run마다 `resetBladeFx` + `seedBladeFx`).

### 초안 — 워크트리 없이

새 판은 src를 고치지 않고 **초안 파일**로 짓는다. `tmp/fx/drafts/<이름>.ts`(git 밖 · 글꼴 시험 밖)에 레시피 전체나 일부 칸을 `export default`로 낸다.

```ts
// tmp/fx/drafts/tide-b.ts
import { RECIPES, type Recipe } from '../../../src/render/bladeFx';
const now = RECIPES.surf; // 원래 칸은 맨 위에서 붙잡아 둔다(부를 때 RECIPES.surf는 초안이 얹힌 판이다)
export default { destroy(x, y, k, c) { /* 새 박자 */ now.destroy(x, y, k, c); } } satisfies Partial<Recipe>;
```

`--draft tmp/fx/drafts/tide-b.ts`를 붙이면 줄이 「지금」 + 초안마다 한 줄이 된다(`movie`는 가로로 나란히). 이게 **지금 | 새 안** 비교다.
담당 여럿이 같은 트리에서 제 초안 파일만 고치고 제 프로세스로 캡처한다. 사용자가 고른 초안만 `src/render/legend5/`로 옮긴다.

한계:
- 바꿔 끼우는 건 `RECIPES`에 든 대검뿐이다(키는 무기 id가 아니라 shape. phoenix → wing · tide → surf · shade → smoke, `sprites.ts` `GREAT_LOOK`).
- `bladeFx.ts` 안에 있는 전설 일곱(wave · crystal · bolt · jag · truss · sumi · royal)은 비공개 도우미를 쓴다. 초안은 export된 것(`put` · `bent` · `line` · `later` · `n01`)으로 짓거나, 필요한 도우미를 export한다.
- 연장 무기 타격(`weaponFx.ts` `TOOLS`)과 필살 몸통(`wazaShow.ts`가 캔버스에 바로 그리는 큰 획)은 초안 범위 밖이다. src를 고치고 고치기 전 띠를 먼저 뽑아 둔다.

### 계측 띠 읽는 법

`strip`은 줄마다 프레임별 ① 무기 조각 층의 보이는 넓이(막대) ② 그 칸에 태어난 조각 수(눈금)를 그린다. `motion.json` `summary`:

- `peakFrac` — 넓이가 정점인 칸 ÷ 끝 칸. 0.5를 넘으면 정점이 늦다. 끝 칸 = 넓이가 정점의 5% 위인 마지막 칸(서 있는 내내 도는 칼 기운이 수백 화소라 0으로는 끝을 못 잡는다).
- `cut` — 마지막 칸에도 정점의 5% 넘게 남았다 = 창이 짧다. `--frames`를 늘려 다시 뽑는다.
- `birthPeakShare` — 가장 많이 태어난 한 칸의 몫. 0.8을 넘으면 거의 한 칸에 다 태어난다.
- `birthFrames` — 조각이 태어난 칸 가짓수. 2 아래면 층이 없다.

**보고용이다.** 숫자로 합격 · 불합격을 내지 않는다. 사용자가 고른 판을 다시 짓는 근거로 쓰지 않는다(불변 13 「사용자가 고른 판을 다시 키우지 마라」).
재는 범위는 `drawBladeFx` 층뿐이다. 공통 주스(`effects.ts`) · 필살 몸통은 띠 그림에는 보이지만 계측에는 안 들어간다.

## 3. 박자 손잡이 (엔진 · 선택 인자 · 안 주면 지금 그림)

| 손잡이 | 자리 | 뜻 |
|---|---|---|
| `fd` | `put` · `line` · `sweep` · `bent`의 옵션 | 꼬리가 깎이기 시작하는 때(기본 0.4). 크게 주면 오래 버틴다 |
| `fe` | 같음 | 꼬리 깎임 곡선 지수. 1보다 크면 버티다 빨리 진다 |
| `ge` | 같음 | 머리가 그어지는 곡선 지수. 1보다 작으면 빨리 나가 느리게 닿는다 |
| `pace` | `legend5/geom.ts` `follow` · `scatter`의 마지막 인자 | 0 → 1을 받아 0 → 1을 내는 박자 곡선. 안 주면 고른 간격 |

넣은 뒤 HEAD와 무기 31 × 사건 6 = 186사례의 그리기 호출열이 같음을 확인했다(11-22). 접촉 정지 동안 조각을 얼리는 손잡이는 넣지 않았다(평타 정지가 2틱이라 안 보이고 필살 박자가 밀린다).

## 4. 고른 판 잠금 — `tests/fx-approved.test.ts`

전설 여덟 · 원소 다섯의 타격 · 층 깨기 · 완파 · 헛스윙 · 칼 기운 그림(`drawBladeFx` 층)을 스냅샷으로 묶는다. 그림이 바뀌면 떨어진다.

떨어졌을 때:
1. 의도하지 않았으면 공용 코드(`bladeFx` · `ink` · `geom`)를 건드린 탓이다. 되돌린다.
2. 의도했으면 `strip` · `movie --draft`로 지금 | 새 안을 사용자에게 보인다.
3. 사용자가 새 안을 고른 뒤에만 `npx vitest run tests/fx-approved.test.ts -u`.

범위 밖: 공통 주스(`effects.ts`) · 필살 몸통(`wazaShow.ts`) · 연장 무기.

## 5. 건뿌 기준 숫자 (정본은 INK_FX §16)

완파 = 화면 폭 60~90% 또는 주인공 키 4~6배 · 층 깨기 ≈ 완파 60% · 타격 ≈ 40% · 헛스윙은 작게 · 한 사건 붓 획 40 안 ·
몸 상자(발 위 0~60 · 좌우 ±18)와 「콤보」 · 「끝」 도장 자리는 비운다 · 칼 기운은 칼날에서 35px · 칼끝 너머 20px 안.

## 6. 옛 도구

`tmp/wazafx/legfx2.mjs` · `wazacap.mjs` · `weap5.mjs`, `tmp/gamey/legfx.mjs`, 다른 워크트리의 `tmp/cap/fx-moments.mjs` · `motion.mjs` · `waza.mjs`가 하던 일을 `scripts/fx/fx.mjs`가 맡는다.
옛 파일은 지우지 않았다(git 밖). 새 캡처 스크립트를 `tmp/`에 짜지 않는다. 모자란 장면 · 옵션은 `scripts/fx/page.ts`에 더한다.
