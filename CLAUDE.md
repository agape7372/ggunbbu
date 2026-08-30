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
   `config.ts` 15건은 `[튜닝]`/`[검증요]`로 강등 완료. **`src/core/`·`tests/` 56건은 미감사 부채**다
   — 이 딱지를 근거로 값을 신성불가침 취급하지 마라. 원작 실측 대조의 정본은
   `docs/ORIGINAL_BENCHMARK_2026-08-30.md` §3 델타표 하나뿐이다.
3. **체크포인트 산술 30/40/148/168/180/228/230**은 `tests/checkpoints.test.ts`가 가드.
   config 수치 변경 시 이 테스트가 깨지면 안 됨. 단 이 가드는 **표의 산술 자기정합성**을
   지킬 뿐 원작 대조가 아니다(깨져도 "원작 이탈"이 아니라 "표 내부 모순"이다).
4. 콤보 = 유효 타격당 +1. 단절 경로는 `combat.ts` 주석의 전수 목록이 정본.
5. 이벤트는 타격/판정 지점에서 정확히 1개 발행 — act2run 테스트가 타격 수를 이벤트로 계측한다.
6. 런타임 의존성 0 유지 (devDeps: vite/typescript/vitest만).

## 검증

- `npm test` — 39+ 테스트, 특히 `act2run`(헤드리스 2막 완주) green 필수.
- 브라우저 확인: `.claude/launch.json` → 프리뷰(포트 5173), 모바일 뷰포트 375×812.
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
