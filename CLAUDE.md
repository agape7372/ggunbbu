# 건뿌 (GUNBBU) — 프로젝트 규칙

키루비루(斬るビル) 메커니즘 재현 + 오리지널 에셋의 모바일 웹 게임.
계획 정본: `C:\Users\agape\.claude\plans\https-namu-wiki-w-ed-82-a4-eb-a3-a8-eb-b-recursive-clover.md`
작업 로그: `docs/DEVLOG.md` (마일스톤마다 append — 필수).

## 불변 규칙

1. **`src/core/` = 순수 시뮬**: DOM/canvas import 금지. 입력은 `InputFrame` 주입,
   난수는 `rngState` 경유(mulberry32)만. 렌더/오디오는 `GameState.events` 소비.
2. **전 튜닝 상수는 `src/config.ts` 단일 출처.** [정본] 주석 = 원작 명시 수치, 변경 금지.
3. **체크포인트 산술 30/40/148/168/180/228/230**은 `tests/checkpoints.test.ts`가 가드.
   config 수치 변경 시 이 테스트가 깨지면 안 됨(깨지면 원작 이탈).
4. 콤보 = 유효 타격당 +1. 단절 경로는 `combat.ts` 주석의 전수 목록이 정본.
5. 이벤트는 타격/판정 지점에서 정확히 1개 발행 — act2run 테스트가 타격 수를 이벤트로 계측한다.
6. 런타임 의존성 0 유지 (devDeps: vite/typescript/vitest만).

## 검증

- `npm test` — 39+ 테스트, 특히 `act2run`(헤드리스 2막 완주) green 필수.
- 브라우저 확인: `.claude/launch.json` → 프리뷰(포트 5173), 모바일 뷰포트 375×812.
- `npx tsc --noEmit` 상시 클린.

## 위임 (토큰 절약 — 사용자 요구)

단순작업(CSS/보일러플레이트/스프라이트/사운드 프리셋)은 Haiku/Sonnet 서브에이전트에.
프롬프트에 ① 단일 파일 경로 ② export 시그니처 원문 ③ import 화이트리스트 ④ 참조 파일 경로 명시.
core/통합/테스트는 메인이 직접.

## 참고

- 스프라이트는 추후 코덱스로 교체 예정(사용자) — 아트 품질 패스 불요, 인터페이스만 유지.
- 원작 에셋(스프라이트·MIDI·명칭·내레이션 텍스트) 사용 금지.
