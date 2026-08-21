# Handoff: 건뿌 — 원작 대조 기반 조작감 교정 (M0~M8 완료 + 원작 파리티 1차)

## Session Metadata
- Created: 2026-08-21 21:19:19
- Project: C:\Users\agape\Desktop\코딩\gunbbu
- Branch: main (origin: https://github.com/agape7372/ggunbbu)
- Session duration: 장시간 단일 세션 (계획 수립 → 전 구현 → 배포 → 원작 대조 교정)

### Recent Commits (for context)
  - 00c7416 fix: 원본 대조로 조작감 교정 — 게이지 2종 분리, 점프 무적, 연타·비율 원작화
  - 9949251 docs: GitHub Pages 배포 완료 — 플레이 주소 안내
  - 25db42d chore: 폰 접속 경로 추가 — dev:lan 스크립트 + GitHub Pages 자동 배포
  - 2bf04a8 tune: 점수 곡선 실측 기반 조정 + 토코톤 버터바 왕복 테스트
  - 34d2e3f feat: 입력·렌더·씬 배선 + 토코톤 버터바 주기 + 빌드 검증

## Handoff Chain

- **Continues from**: None (fresh start)
- **Supersedes**: None

> 이 프로젝트의 첫 핸드오프.

## Current State Summary

2004년 일본 프리게임 키루비루(斬るビル, 한국명 "건물부수기")의 모방작을 모바일 웹 게임으로 구현했다.
계획 승인 후 M0~M8을 전부 구현해 **플레이 가능·배포 완료** 상태이며(https://agape7372.github.io/ggunbbu/),
이후 사용자가 "조작감이 너무 다르다"고 지적해 **원작 배포본을 받아 에셋·설명서를 해부**하고 근본 오류
4가지를 교정했다. 현재 테스트 48개 전부 통과, tsc 클린, 빌드·배포 정상.
남은 가장 큰 미해결 항목은 **화면 방향**(원작 가로 640×480 vs 현재 세로 360×640)으로, 사용자 결정 대기 중.

## Architecture Overview

- **Vite + TypeScript + 순수 Canvas 2D 자체 엔진.** Phaser 등 게임 라이브러리 미사용, 런타임 의존성 0
  (devDeps는 vite/typescript/vitest 3개뿐). 빌드 산출물 JS 67KB(gzip 23KB).
- **핵심 설계 원칙: `src/core/`는 DOM을 모르는 순수 시뮬레이션.** 입력은 `InputFrame` 데이터로 주입,
  난수는 시드 PRNG(mulberry32) 상태를 `GameState.rngState`에 보존, 렌더/오디오는 상태를 읽기만 한다.
  이 분리 덕에 헤드리스 결정론 테스트(2막 완주 주행)가 가능하다 — **절대 깨뜨리지 말 것**.
- 60Hz 고정 타임스텝 + accumulator 루프. 렌더 보간 없음.
- `core`는 씬을 모른다. `src/ui/scenes.ts`가 씬 전이·저장·오버레이를 관장하고 `advance()` 호출을 통제한다.
- **타격감 이벤트 큐**: core가 `GameState.events`에 `JuiceEvent`만 발행하고, 렌더러가 프레임마다 소비
  (셰이크·플래시·의성어·사운드·진동) 후 씬이 클리어한다. core의 순수성을 지키는 통로.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `src/config.ts` | 전 튜닝 상수 단일 출처. `[정본]` 주석 = 원작 확인 수치 | 밸런스 변경은 전부 여기서. 최우선 |
| `src/core/types.ts` | 전 타입 계약(GameState/Entity/JuiceEvent) | 위임·모듈 계약의 근간 |
| `src/core/sim.ts` | 1틱 오케스트레이터, 깔림/필살기/접지/모드 진행 | 규칙 변경의 중심 |
| `src/core/combat.ts` | 타격 판정·콤보·점수·게이지·가드 바운스 | 콤보 단절 전수 목록이 주석에 정본으로 있음 |
| `src/core/player.ts` | 상태기계(공격/가드/점프), 착지 직후 점프가드 불가 재현 | 조작감 직결 |
| `src/core/act2.ts` / `boss.ts` | 2막 5페이즈 FSM / 위성 보스 7패턴 FSM | 최대 복잡도 지점 |
| `tests/checkpoints.test.ts` | 원작 콤보 산술 30/40/148/168/180/228/230 가드레일 | config 수정 시 여기가 깨지면 원작 이탈 |
| `tests/act2run.test.ts` | 헤드리스 2막 주행 — 타격 수 불변량 + 콤보 무단절 | 최상위 수용 기준 |
| `docs/DEVLOG.md` | 마일스톤별 결정·문제·해결 기록 | **작업 시작 전 필독** |
| `CLAUDE.md` | 프로젝트 불변 규칙 | 필독 |

## Key Patterns Discovered

- **수용 기준 2층 구조**: (a) *타격 수 공간* — 페이즈별 필요 타격 수는 레인당 HP 합으로 구조적으로 고정되어
  콤보 단절과 무관한 불변량(대성당 30 / 마천루 138 / 번개 12 / 화산탄 48). (b) *콤보 공간* — 무단절 주행은
  느린 페이즈에서만 봇으로 검증. 어려운 페이즈(대성당·보스)는 원작도 숙련 영역이라 봇 완주를 요구하지 않고
  구조 검증으로 대체한다. **테스트를 통과시키려 게임을 쉽게 만들지 말 것.**
- 봇 정책 개선은 빠르게 수확 체감한다. 실패 시 "게임 버그인가 봇 한계인가"를 먼저 가르고, 봇 한계면
  불변량을 격리 검증(예: `s.lives = 99`)하는 쪽이 옳다.
- Windows 콘솔이 cp949라 파이썬으로 일본어/UTF-8을 `print`하면 `UnicodeEncodeError`가 난다.
  결과는 반드시 파일로 쓸 것(`io.open(path,'w',encoding='utf-8')`).
- 서브에이전트 위임 시 ① 단일 절대 경로 ② export 시그니처 원문 ③ import 화이트리스트 ④ 참조 파일 경로를
  프롬프트에 못박으면 재작업이 없다.

## Tasks Finished

- [x] 나무위키 원문에서 게임 스펙 추출 → 상세 구현 계획 수립·승인
- [x] M0 스캐폴드(Vite+TS 수동, 한글 경로 리스크 회피) + git/원격 연결
- [x] 코어 시뮬 전체: rng/building/combat/player/spawner/sim/act2/boss
- [x] 1막(챕터 4종 스토리 해금) + 버터바 이벤트 스테이지 + 2막 5페이즈 + 보스 7패턴 + 엔딩 + 토코톤
- [x] 입력(키보드+터치 6버튼) / 렌더러(이벤트 소비형 타격감) / 씬 머신 / 병맛 스토리
- [x] 위임 산출물 통합: 스프라이트, WebAudio(BGM 7트랙·SFX 30종), storage, PWA, 아이콘, 터치 레이어
- [x] GitHub Pages 자동 배포(테스트→빌드→배포) + 폰 실접속 확인
- [x] 점수 곡선 실측 튜닝(10분 1.78M → 목표 밴드 진입)
- [x] **원작 배포본 해부 → 조작감 근본 오류 4건 교정**
- [x] 테스트 48개 전부 통과, tsc 클린

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `src/config.ts` | GAUGE → GUARD_GAUGE/WAZA_GAUGE 분리, 공격 9f→6f, 층 40→68, 레인 120→90, 리치 128→68, 낙하속도 ×1.7 | 원작 계측 반영 |
| `src/core/types.ts` | `gauge` → `guardGauge`/`wazaGauge`/`guardRegenCd` | 게이지 2종 체계 |
| `src/core/sim.ts` | 점프 무적, 착지 시 깔림, 방어 게이지 회복, `onPlayerCrushed` 분리 | 원작 규칙 재현 |
| `src/core/combat.ts` | 가드=방어게이지·타격=기술게이지, 999 중복 이벤트 제거, 가드 스윕 판정 | 자원 분리 + 터널링 픽스 |
| `src/core/player.ts` | 가드 진입/드레인이 방어 게이지 참조 | 동상 |
| `src/render/renderer.ts` | 게이지 바 1개 → 2개(핑크 방어 / 황색 기술) | 원작 UI 반영 |
| `tests/*` | 48개로 확장, 스케일 독립 단언으로 전환 | 회귀 방지 |
| `docs/DEVLOG.md` | 원작 대조 결과 상세 기록 | 지식 보존 |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| 모바일 **웹**(PWA) | Expo/RN, Godot, 웹 | Windows에서 iOS 빌드 불가, 브라우저 페인으로만 검증 가능, PWA로 앱 경험 확보 |
| 순수 Canvas 자체 엔진 | Phaser 3 | 3레인+낙하체 1개라 물리엔진 불필요, 고정 틱 결정론이 테스트의 전제, 의존성 드리프트 리스크 회피 |
| 원작 EXE **실행 안 함** | 실행해서 물리 계측 | 출처 불명 구형 실행파일 실행 금지. 대신 에셋·설명서 계측으로 대체 |
| 게이지 2종 분리 | 위키 서술대로 통합 유지 | 개발자 설명서 + 에셋(bougyobar/wazabar) 2종이 결정적 증거. 통합 시 자원 구조가 다른 게임이 됨 |
| 참격 리치 = 층 1개 | 기존 3.2층 유지 | 원작 층 120px vs 참격 67px → 리치가 층을 넘지 않음. 위치 선정이 게임의 핵심 |
| 낙하 속도 ×1.7 동반 스케일 | 속도 유지 | 층 높이만 키우면 "초당 층수" 템포가 붕괴. 검증된 밸런스(점수 곡선·체크포인트)를 보존 |
| 보스/대성당 봇 완주 미요구 | 봇 정책 계속 개선 | 원작 위키도 대성당을 "지면가드 강요 페이즈"로 인정. 수확 체감. 구조 검증으로 대체 |
| GitHub Pages 배포 | 방화벽 규칙 추가(LAN) | 네트워크가 공용이라 인바운드 차단. 보안 설정 변경 대신 배포 선택. HTTPS라 iOS PWA도 정상 |

## Immediate Next Steps

1. **화면 방향 결정 반영** — 사용자에게 물어본 상태. 원작은 가로 640×480, 현재는 세로 360×640.
   비율은 이식했지만 방향이 달라 체감이 다르다. 세로 유지 / 가로 모드 도입 / 양쪽 지원 중 답을 받아 적용.
   가로로 갈 경우 `VIEW`(W/H/LANE_X/FIELD_H), `style.css` 버튼 배치, 레터박스 로직이 함께 바뀐다.
2. **콤보 팝업 원작화** — 원작은 타격마다 숫자 팝업이 생겨 여러 개가 동시에 흩뿌려진다(플레이 영상 확인).
   현재 `JUICE_SYS.ONOMATOPOEIA_MAX = 3` 제한 + 단일 스타일. `src/render/renderer.ts`의 `popups` 배열
   확장 + 숫자 표시 추가로 대응. 시각적 쾌감의 큰 부분.
3. **실기 플레이테스트** — 폰에서 직접 해보고 새 비율(층 68px·리치 1층·연타 100ms)의 체감 확인.
   특히 대성당(초고속)이 사람이 넘을 수 있는 난이도인지 검증. 노브: `CATHEDRAL_VTERM`, `GUARD_AIR_V`, `HIT_LIFT_V`.

## Blockers/Open Questions

- [ ] 화면 방향(가로/세로) — **사용자 결정 대기**. 이게 정해져야 UI·비율 후속 작업이 확정된다.
- [ ] 원작 물리의 절대 수치(px/s, 점프 체공)는 미확보. EXE 미실행 방침 + 영상 프레임 분석이 브라우저
      스로틀로 실패했다. 현재 값은 "원작 비율 + 자체 밸런싱" 기반이며 실측치가 아니다.

## Deferred Items

- **스프라이트 아트 품질** — 사용자가 "이미지는 나중에 코덱스로 구현"한다고 명시. `src/render/sprites.ts`는
  인터페이스만 유지하고 품질 패스는 하지 않는다.
- 파편 파티클(`effects.ts`) — 이미지 교체 시점에 함께.
- 오프라인 SW 실기 리로드 확인 — 검증된 podoal 이식본이라 저위험.
- 화산탄 더미 위 착지 깔림 — 미구현(낙하 중 피격만 처리).

## Important Context

**이 프로젝트의 판단 기준은 "원작 재현"이다.** `[정본]` 주석이 붙은 수치는 나무위키 원문 또는 원작
개발자 설명서/에셋에서 확인된 사실이며 임의 변경 금지. 테스트가 실패할 때 **테스트를 느슨하게 만들어
통과시키는 것은 이 프로젝트에서 가장 위험한 실수**다 — 원작 산술(체크포인트 30/40/148/168/180/228/230)이
곧 게임의 정체성이기 때문이다.

**원작 계측 자료 위치** (레포 밖, 임시 폴더):
`C:\Users\agape\AppData\Local\Temp\claude\C--Users-agape-Desktop----gunbbu\b3528bb2-d264-47c3-af9d-54c15ced0cb0\scratchpad\kirubiru\`
- `ANALYSIS.md` — 스프라이트 기하 계측(층 120px, 캐릭터 82×98, 참격 120×67, 화면 640×480)
- `MANUAL_ko.md` — 개발자 설명서 번역 (게이지 2종·점프 무적의 근거)
- `SOUNDS.md` — 효과음 16종 길이 (참격 88ms 등 = 리듬의 근거)
- `DATA_FILES.md`, `EXE_STRINGS.txt`, `png/` (에셋 PNG 변환본)

이 폴더는 임시 저장소라 **세션 종료 후 사라질 수 있다.** 원작 재대조가 필요하면
`http://liku.s33.xrea.com/game/down/kirubiru/kirubiru.lzh`(개발자 공식 사이트, 2004년 파일, 생존 확인)에서
다시 받아 7-Zip으로 풀면 된다. **원본 그래픽·음악·텍스트는 절대 레포에 넣지 말 것** — 저작권.
메커니즘·수치·비율(사실)만 참고한다. 현재 레포에 원본 에셋 없음을 검증했다.

**사용자 지시 사항 (지속 적용)**:
- 단순 작업은 하위 모델(Haiku/Sonnet)에 위임해 토큰 절약 — 명시적 요구
- 마일스톤마다 `docs/DEVLOG.md` 기록, 리팩토링 패스 병행
- 브랜드는 **B급 병맛 개그**, 타깃 10~30대 남성 (`docs/DEVLOG.md` 및 계획서 참조)
- 이미지 품질은 신경 쓰지 말고 **물리·요소 구현에 집중**

## Assumptions Made

- 원작 화면 640×480 기준 비율을 세로 360폭에 균일 배율 0.5625로 이식하는 것이 타당하다고 가정.
  (화면 방향 결정이 뒤집히면 이 가정도 재검토 대상)
- 낙하 속도를 층 높이와 같은 배율로 스케일하면 기존 밸런스(점수 곡선·체크포인트)가 보존된다고 가정,
  테스트로 확인함.
- 봇의 실효 플레이는 인간 상급자의 40~50% 수준으로 가정하고 점수 곡선을 역산했다(10분 실측 기준).

## Potential Gotchas

- **브라우저 페인이 표시되지 않으면 `document.hidden`으로 게임 루프가 멈춘다.** 검증 시
  `window.__app.update(1/60)`을 수동 호출해야 한다(`?debug=1`일 때만 `__app` 노출).
- vitest 실행 시 `tests/` 아래 임시 디버그 파일을 만들면 `npm test`에 딸려 들어간다. 계측 끝나면 삭제.
- 스프라이트 에이전트가 확인한 사실: 원작 건물 시트 3종(bil10 / bil20 / bil30)은 HP 1/2/3이 아니라 **서로 다른 건물 디자인 3종**이다.
  (파일명이 HP를 뜻할 거라는 초기 가설은 기각됨)
- `git` 커밋 시 CRLF 경고가 대량 출력되지만 정상이다.
- LAN 접속(`vite --host`)은 네트워크 프로필이 "공용"이라 방화벽에 막힌다. 폰 테스트는 Pages 배포 주소 사용.

## Tools/Services Used

- Node v24.11.1 / npm 11.6.2, devDeps: vite / typescript / vitest
- GitHub Pages (Actions 배포, `.github/workflows/deploy.yml`) — `gh` CLI 인증됨
- 7-Zip (원작 lzh 해제용, winget으로 설치)
- 브라우저 페인(preview_start + `?debug=1`)으로 실동작 검증

## Active Processes

- dev 서버가 백그라운드에 떠 있을 수 있다(포트 5173). 필요 없으면 정리.
- 배포된 사이트: https://agape7372.github.io/ggunbbu/ (푸시마다 자동 갱신)

## Environment Variables

- 없음. 이 프로젝트는 환경변수·시크릿을 사용하지 않는다.

## Related Resources

- 계획 정본: `C:\Users\agape\.claude\plans\https-namu-wiki-w-ed-82-a4-eb-a3-a8-eb-b-recursive-clover.md`
- 개발 로그: `docs/DEVLOG.md` (원작 대조 결과가 여기 상세히 있음)
- 프로젝트 규칙: `CLAUDE.md`
- 원작 참고 문서: https://namu.wiki/w/키루비루
- 레포: https://github.com/agape7372/ggunbbu
- 플레이: https://agape7372.github.io/ggunbbu/

---

**Security Reminder**: 이 핸드오프에는 시크릿·토큰·자격증명이 포함되어 있지 않다(프로젝트가 사용하지 않음).
