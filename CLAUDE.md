# 건뿌 (GUNBBU) — 프로젝트 규칙

키루비루(斬るビル) 메커니즘 재현 + 오리지널 에셋의 모바일 웹 게임.
계획 정본: `C:\Users\agape\.claude\plans\https-namu-wiki-w-ed-82-a4-eb-a3-a8-eb-b-recursive-clover.md`
작업 로그: `docs/DEVLOG.md` (마일스톤마다 append — 필수).

## 불변 규칙

1. **`src/core/` = 순수 시뮬**: DOM/canvas import 금지. 입력은 `InputFrame` 주입,
   난수는 `rngState` 경유(mulberry32)만. 렌더/오디오는 `GameState.events` 소비.
2. **전 튜닝 상수는 `src/config.ts` 단일 출처.**
   ⚠ **`[정본]` 딱지는 "원작 명시 수치"가 아니다** (2026-08-30 감사). 이 레포의 `[정본]`은
   전부 계획 정본(나무위키 서술 기반 계획서) 유래이고, 원작 exe 대조를 거친 적이 없다.
   `config.ts` 15건은 `[튜닝]`/`[검증요]`로 강등 완료. **`src/core/`·`tests/` 64건은 미감사 부채**다
   (core 40·tests 24, 2026-09-05 `grep -c "\[정본" src/core/*.ts tests/*.ts` 실측. 이전 표기 "56건"은
   낡은 값이었다. 09-05에 `sim.ts` 2건이 거짓 주석 정정으로 빠졌고, core 40 중 1건은 딱지가 아니라
   "딱지를 붙이지 않는다"는 서술이다)
   — 이 딱지를 근거로 값을 신성불가침 취급하지 마라. 원작 실측 대조의 정본은
   `docs/ORIGINAL_BENCHMARK_2026-08-30.md` §3 델타표 하나뿐이다.
3. **체크포인트 산술 30/40/148/168/180/228/230**은 `tests/checkpoints.test.ts`가 가드.
   config 수치 변경 시 이 테스트가 깨지면 안 됨. 단 이 가드는 **표의 산술 자기정합성**을
   지킬 뿐 원작 대조가 아니다(깨져도 "원작 이탈"이 아니라 "표 내부 모순"이다).
4. 콤보 = 유효 타격당 +1. 단절 경로는 `combat.ts` 주석의 전수 목록이 정본.
5. 이벤트는 타격/판정 지점에서 정확히 1개 발행 — act2run 테스트가 타격 수를 이벤트로 계측한다.
6. 런타임 의존성 0 유지 (devDeps: vite/typescript/vitest만).
7. **조작 문법 2건은 되돌리기 금지 계약**(2026-08-30 4~6차, 사용자 실플레이 판정으로 두 번 뒤집힌 자리).
   - **점프 = 단발 엣지.** 홀드로 높이를 조절하는 가변 점프(`jumpHold`/`JUMP_CUT`/`FALL_MUL`)는
     넣었다가 철거됐다. 체공이 길다면 홀드가 아니라 **시간축을 압축**한다 — 정점 보존식
     `h = v²/(2g)`로 `GRAVITY`·`JUMP_V0`를 같이 올린다(현행 1735/1388, 정점 555px=8.2층 불변).
     원작 대조가 남은 건 **정점 하나뿐**이다. 체공 4.67초는 원작 이론값이고 원작 플레이어는
     42px에서 막혀 그걸 안 겪는다 — 딱지 `[튜닝]`. 가드: `tests/jump.test.ts`.
   - **카메라 = 데드존 추종**(`CAMERA.DEADZONE/MAX/LERP` 150/150/0.18). 고정(cam=0)으로
     되돌리지 마라. `translate(0, cam)` 구조상 **지면 소실은 산술적으로 못 피한다** — "소실 0%"는
     계약이 아니고, MAX 상한 + 짧아진 체공 + 지면 인디케이터 셋으로 관리한다.
     가드: `tests/camera.test.ts`.
8. **특별작전(기믹 판)은 시간제다** — 구역 경계·2막 문턱을 넘어도 그 구역에 머물고 난이도만 p를 따라 오른다
   (`sim.ts` stepAct1의 `s.gimmick === 'none'` 조건). 가드: `tests/gimmick.test.ts`.

## 검증

- `npm test` — 412 테스트(2026-10-28 탭 화면 손질 뒤 기준), 특히 `act2run`(헤드리스 2막 완주) green 필수.
- **새 한글은 주석까지 글꼴 서브셋에 들어가야 한다** — src `.ts`·`.json`·html에 처음 쓰는 글자가 있으면
  `tests/font-glyphs.test.mjs`가 깨진다 → `python scripts/subset-fonts.py tmp/fonts-src`로 다시 굽는다
  (원본 TTF 5개는 `tmp/fonts-src/`에 둔다, gitignore. 없으면 Google Fonts 저장소에서 받는다).
- 디버그 APK: `npm --prefix shell run web:build` → `npm --prefix shell run sync` → `npm --prefix shell run apk`.
  릴리스 빌드는 `shell/android/key.properties`가 없거나 광고 ID가 테스트 값이면 gradle이 멈춘다(`docs/RELEASE.md`).
- 브라우저 확인: `.claude/launch.json` → 프리뷰(포트 5173), 모바일 뷰포트 375×812.
  화면 검수는 화면비 여럿으로 — 375×812만 보면 무대가 높이에 먼저 닿는 넓은 기기(사용자 실기기 416×657)에서
  메뉴가 화면 폭 61%에 갇힌 걸 못 본다(10-28). 메뉴 폭 ÷ 화면 폭을 숫자로 잰다.
- `npx tsc --noEmit` 상시 클린.

## 위임 (토큰 절약 — 사용자 요구)

단순작업(CSS/보일러플레이트/스프라이트/사운드 프리셋)은 Sonnet 5 이상 서브에이전트에 (**Haiku 금지** — 사용자 지시).
프롬프트에 ① 단일 파일 경로 ② export 시그니처 원문 ③ import 화이트리스트 ④ 참조 파일 경로 명시.
core/통합/테스트는 메인이 직접.

## 참고

- 스프라이트는 추후 코덱스로 교체 예정(사용자) — 아트 품질 패스 불요, 인터페이스만 유지.
- 원작 에셋(스프라이트·MIDI·명칭·내레이션 텍스트) 사용 금지.
- 네이티브(Capacitor/AdMob/OTA)는 `src/platform/`에서만 만난다. 접근은 `window.Capacitor.Plugins`
  **런타임 조회만** — 정적/동적 bare import 금지(웹 번들 오염·WebView 무음 null). 플러그인 패키지는
  `shell/`에만 있고 루트 런타임 의존성은 0을 유지한다. IAP는 v1 제외(ROADMAP).
- 웹 번들 버전 = `src/version.ts` 단일 출처. 손으로 고치지 말고 `npm run ota:release -- <version>`이 갱신한다.
- 에셋 예산 게이트: `npm run build`가 `scripts/check-budget.mjs`로 dist·이미지 상한과 중복을 검사한다.
