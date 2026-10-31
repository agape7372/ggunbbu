// 건뿌 — 전 튜닝 상수 단일 출처.
//
// ★2026-08-30 딱지 재분류. 이 파일의 어떤 숫자도 원작 exe 근거가 없다.
// 예전 [정본] 딱지 15건은 전부 계획 정본(나무위키 서술 기반 계획서)에서 왔고,
// 프로젝트 최초 커밋부터 검토 없이 존재하다가 값만 드리프트했다. 전량 강등했다.
//   [튜닝]   = 리메이크 밸런싱. 유래가 문서화된 값 (원작 근거 없음 ≠ 나쁜 값)
//   [검증요] = 유래 불명 드리프트. 왜 이 값인지 아무도 모른다 — 재판정 대상
// 원작 실측값과의 대조는 docs/ORIGINAL_BENCHMARK_2026-08-30.md §3 델타표가 정본이다.
// 여기에 원작 숫자를 복사하지 마라 — 사본이 늘면 그게 다음 드리프트다.
// ⚠ src/core/·tests/ 의 [정본] 64건(core 40·tests 24, 2026-09-05 실측)은 아직 미감사다
// (행동 불변식 주장 위주). 근거는 CLAUDE.md 불변 규칙 2 — 여기 숫자는 그 사본이다.
// 체크포인트 산술(30/40/148/168/180/228/230)은 tests/checkpoints.test.ts가 가드한다.

import type { ItemId, WeaponId } from './core/types';

export const TICK = 1 / 60;
export const TPS = 60;

// ── 화면/좌표 (논리 캔버스, 물리 y축: 지면=0, 위가 +) ─────────────
// ★08-30 사용자 지시("공간 너무 낭비야. 플레이화면이 더 넓어야지"): 논리 캔버스를 세로로 늘려
// 요즘 폰(19.5:9)에서 위아래로 남던 죽은 띠를 필드로 돌린다. 375×812 기준 배율이
// min(375/360, 812/780)=1.041 이 되어 띠가 사실상 0이 되고, 필드는 화면상 489px → 635px(+30%).
// ★시뮬은 안 건드린다 — FIELD_H/GROUND_Y는 렌더 뷰포트 상수고 core는 자기 단위(지면=0)로 돈다.
// 조작 존 높이(170)는 그대로. ★그 뒤 원작 물리 도입으로 정점이 555px가 됐다 — 필드(560)를
// 거의 꽉 채운다. 그래서 08-30 4차에 데드존 추종 카메라가 붙었다(CAMERA 주석).
export const VIEW = {
  W: 360,
  H: 780,
  FIELD_H: 610,          // 필드 하단선(= 지면). 하단은 조작 존
  // ★08-30 3차 감식: 필드를 키웠더니 "HUD와 낙하 건물이 같은 좌표를 놓고 부딪히는" 골격 문제가
  // 드러났다 — 건물이 화면에 들어오는 첫 250ms 동안 HUD 글자 뒤를 지난다(진입 = 반응이 가장
  // 필요한 구간). HUD에 자기 띠를 주고 필드는 그 아래에서 시작한다. 렌더 전용 상수 — core 무관.
  FIELD_TOP: 50,
  // 원작 실측 비율 이식: 건물 1채 = 화면폭 75%(480/640), 층 높이 = 화면높이 25%(120/480),
  // 캐릭터 높이 = 층의 0.82배(98/120). 세로 화면(360폭)에 균일 스케일 0.5625 적용.
  // ★08-30 정정: 여기 있던 "원작에 좌우 이동이 없다(사용자 원작 대조)"는 사실이 아니다.
  // 원작 디컴파일이 반박한다 — 3레인(x 136/256/376, 플레이어 +0x28 에 0·1·2 가드)과
  // 좌·우 대시 전용 상태함수 2개가 존재한다(벤치마크 §5-B). 단일 레인은 "원작에 없어서"가
  // 아니라 세로 360폭 모바일 조작성 때문에 고른 것이다 — 그 근거로만 유지한다.
  // ★2026-08-30 사용자 확정: **단일 레인 고정. 3레인 복원 제안·재질문 금지.**
  LANE_W: 270,                // 건물/세그먼트 폭 = 360의 75%
  LANE_X: [180] as const,     // 레인 중심 (단일 — 사용자 확정, 불변)
  BUTTER_W: 90,               // 버터바 폭 (좁은 낙하물 — 건물과 구분)
  FLOOR_H: 68,                       // 120 × 0.5625
  GROUND_Y: 610,         // 캔버스 픽셀상 지면 라인 (렌더 변환용) = FIELD_H
  // 적응형 해상도 [튜닝] — 저사양 폰에서 메인 캔버스 배율만 한 단계씩 낮춘다(세션 중 다시 올리지 않음)
  DPR_LADDER: [2, 1.5, 1] as const,
  ADAPT_WINDOW_MS: 1000,   // 최근 이 시간의 평균 프레임 간격을 본다
  ADAPT_SLOW_MS: 20,       // 평균 간격이 이보다 길면 느린 상태(50fps 미만)
  ADAPT_HOLD_MS: 2000,     // 느린 상태가 이만큼 이어지면 한 단계 내린다
  ADAPT_MAX_DT_MS: 100,    // 한 번 크게 멈춘 프레임은 이 값으로 자른다(백그라운드 복귀·GC 한 번에 안 흔들리게)
} as const;

// ── 카메라 (렌더 전용. 시뮬 y는 그대로) ─────────────────────────
// ★08-30 재설계: "발 1:1 추종(max(0, y-140))"을 실측 근거로 폐기 — QA 계측에서 체공의
// 75.9% 동안 지면·번개 예고·대포가 화면 밖이었다(ROADMAP_2026-08-30.md Wave 0).
// 새 규칙: 플레이어가 필드 상단을 뚫으려 할 때만 최소로 딸려 올라간다. 정점이 필드 안이면
// cam=0 — 지면과 예고 마커가 항상 보인다. 이 기록 없이 추종 카메라로 되돌리지 말 것.
//
// ★08-30 4차 개정 — 위 기록을 지우지 않고 잇는다. 사용자 실플레이 영상 판정: "카메라가 고정
// 되어있잖아". 체감이 아니라 사실이었다 — 정점에서 cam = 555+55+24−610 = **24px**(필드 560의 4%).
// 벤치마크 §2가 원래 이걸 예고했다: "원작 점프 높이를 도입하려면 카메라부터 되살려야 한다."
// 08-30에 원작 점프(정점 555px)는 도입됐는데 카메라만 안 따라왔다 — 이 개정이 그 나머지 절반이다.
//
// ⚠ 폐기 사유였던 "지면 소실"은 **산술적으로 못 피한다.** 렌더가 `translate(0, cam)`이라
// 카메라가 올라가면 지면선(GROUND_Y=610 = 필드 클립의 바닥변)은 그만큼 화면 아래로 밀려
// 나간다. cam>0이면 지면은 화면에 없다. 필드 560px에 정점 555px를 담으면서 지면도 붙잡아
// 두는 구성은 존재하지 않는다 — 옛 규칙이 cam≈0을 고른 게 그래서였고, 그 대가가 붙박이 화면이었다.
// 그래서 "소실 0%"를 목표로 삼지 않는다. 대신 셋으로 관리한다:
//   ① MAX 150 — 지면은 필드 바닥에서 최대 150px 아래까지만. 폐기된 1:1 추종(정점에서 415px)의 36%.
//   ② ~~가변 점프가 짧은 탭을 cam=0으로 남긴다~~ ← 5차에 가변 점프 철거(단발 복귀). 대신 점프가
//      0.80초로 짧아져 **cam>0 구간 자체가 짧다** — 지면이 사라져 있는 절대 시간이 1/2.9로 줄었다.
//   ③ 지면 인디케이터 — cam>0이면 필드 바닥변에 지면선을 고정 표시한다(renderer.drawGame).
//      "내가 어디로 떨어지는가"는 카메라가 어디에 있든 화면에서 안 사라진다.
// 예고 마커(번개·대포)는 Wave 0-4가 이미 카메라 변환 밖으로 빼놨다 — 그쪽은 애초에 무관하다.
// 되돌리려면 이 세 줄부터 뒤집을 것.
export const CAMERA = {
  HEADROOM: 24,          // 플레이어 머리 위 여유(px)
  DEADZONE: 150,         // 필드 상단에서 이만큼 아래에 오면 따라가기 시작 [튜닝]
  MAX: 150,              // 상한. 지면이 필드 바닥에서 벗어나는 최대 거리 [튜닝]
  LERP: 0.18,            // 프레임당 보간 계수 (렌더 전용. 순수 목표값은 cameraFollowY)
  BG_PARALLAX: 0.35,     // 배경이 카메라를 따라오는 비율. 1.0이면 깊이 단서가 죽는다
} as const;

// ── 플레이어 물리 ───────────────────────────────────────────────
export const PLAYER = {
  // ★2026-08-30 4차(원작 물리 도입, 사용자 확정): 원작 실측(벤치마크 §3: 초속 840px/s ·
  // 중력 360px/s² · 정점 980px=8.2층 · 체공 4.67s)을 층 비율 68/120 로 스케일해 GRAVITY 204 ·
  // JUMP_V0 476 으로 이식했다. 이전 값 1150/1780(정점 371px)의 경위는 git과 ROADMAP Wave 0에.
  //
  // ★★08-30 5차 재개정 — **시간축만 리메이크 튜닝으로 분리한다.** 사용자 지시:
  //   "점프가 한번 누르면 슝 솟아야하는데 왜 누르고있게만들었어?"
  // 그 앞 4차에서 나는 원작 수치를 지키려고 **가변 점프(홀드 컷)**를 넣었다 — 수치는 지켰지만
  // 조작 문법을 바꿔버렸다. 원작 점프는 **단발 엣지**다. 홀드 계열(jumpHold·JUMP_CUT·FALL_MUL)은
  // 전부 철거했다. 그러면 느린 원인이 수치 하나만 남는다:
  //
  //   원작 체공 4.67초는 **원작에서 실제로 일어나지 않는다.** 벤치마크 §2-B 동적 실측 — 원작
  //   플레이어는 42px 오르고 낙하 건물 밑면에 막혀 vy가 리셋된다. 4.67초는 "장애물이 없을 때의
  //   이론값"이다. 리메이크는 **건물 없는 시간이 26%**(실기기 영상 43프레임 실측)라 그 이론값을
  //   온전히 겪는다 — 같은 숫자가 다른 게임을 만든다.
  //
  // 그래서 **"몇 층까지 닿는가"(정점 555px = 8.2층)는 원작 그대로 두고 시간축만 압축**한다.
  // 정점 보존식: h = v²/(2g). g를 k배 하면 v는 √k배, 상승시간은 1/√k배.
  //   GRAVITY 204→1735 (8.5배) · JUMP_V0 476→1388 (2.92배)
  //   → 정점 1388²/(2·1735) = **555.2px = 8.17층** (불변)
  //   → 상승 1388/1735 = **0.80초** · 체공 **1.60초** (4.67초의 1/2.9)
  // ⚠ 벤치마크 §3 "체공은 시간축이라 스케일 불변(4.67s=280f)"을 **의도적으로 깬다.** 원작 대조
  // 항목이 아니라 리메이크 튜닝으로 강등한 것이다 — 딱지도 [원작 이식]에서 [튜닝]으로 내렸다.
  // 원작 대조가 살아 있는 것은 **정점(8.2층)** 하나뿐. 되돌리려면 이 문단부터 뒤집을 것.
  GRAVITY: 1735,          // px/s² [튜닝] 정점 보존·시간축 압축 (원작 파생 204의 8.5배)
  JUMP_V0: 1388,          // px/s  [튜닝] 정점 555px = 8.17층은 [원작 이식] 그대로
  W: 46, H: 55,          // 원작 82×98 × 0.5625
  // 원작은 한 번의 참격이 "한 층"에 닿는다(참격 스프라이트 67px vs 층 120px).
  // 기존 128px는 40px 층 기준 3.2개 층을 동시에 때려 위치 선정을 무의미하게 만들었다.
  ATTACK_REACH: 68,       // = FLOOR_H (층 1개)
  // 원작 slash.wav = 88ms → 연타 주기 ~100ms(10타/s). 총 6f.
  ATTACK_PRE: 1, ATTACK_ACTIVE: 3, ATTACK_POST: 2,
  INPUT_BUFFER: 3,        // f
  GUARD_STARTUP_GROUND: 4, // f — "착지 직후 점프가드 불가"의 근원
  GUARD_STARTUP_AIR: 0,
  GUARD_BREAK_STUN: 20,
  HIT_IFRAMES: 90,
  PIN_ESCAPE_IFRAMES_LIFT: 60,
  PIN_ESCAPE_IFRAMES_ATK: 90,
  PIN_REPEAT_TICKS: 120,  // 깔림 방치 시 라이프 반복 손실 주기
  // ★08-30 4차 [사용자 증언] 방치 손실은 자비 바운스를 동반한다(sim.stepPinned 주석 참조).
  // 이 무적은 **튕긴 프레임의 겹침만** 넘기는 최소치다. 탈출 무적(60/90f)을 쓰면 스택 왕복
  // (≈47f)보다 길어서 다시 내려앉아도 안 깔린다 = "쿵"이 사라진다. 늘리기 전에 왕복 틱수부터 재라.
  PIN_TIMEOUT_IFRAMES: 12,
  LIVES: 3,
} as const;

// ── 스택(건물) 물리 ─────────────────────────────────────────────
export const STACK = {
  // 타격 밀어올림. 원작 설명서 "방어를 콤보보다 먼저 익혀라" = 연타만으로는 못 버티고
  // 가드 바운스가 주 방어 수단이어야 한다 → 연타 주기(100ms) 대비 작게.
  HIT_LIFT_V: 80,
  // 아래 둘 = 계획서 700/400 을 FLOOR_H 40→68 이식 때 ×1.7 동반 스케일(커밋 00c7416).
  // 파생 근거는 있으나 원작 근거는 없다. ⚠원작은 공중 가드 반동이 방향부터 다르다 — §3 참조.
  GUARD_GROUND_V: 1190,    // 지면 가드 바운스 [튜닝]
  GUARD_AIR_V: 680,       // 공중 가드 바운스(스택을 띄움) [튜닝]
  // ★2026-08-30 사용자 확정: 공중가드 반동은 원작을 따른다 — 바운스 성공 시 **플레이어가
  // 아래로 튕긴다**(원작 `FUN_00405490` 포즈10: vy=8.0px/f=480px/s 아래로, ×68/120 스케일).
  // 스택 띄우기(GUARD_AIR_V)는 별개로 유지 — "점프가드로 건물 띄워 버티기"는 계획 정본 루프고,
  // 원작의 건물 층 처리기는 공중가드 포즈를 아예 안 다룬다(대응물 없음, 벤치마크 §5).
  // ★10-28 원작 대조 검수: 272(= 480 × 68/120)는 4차 시간축 값이었다. 5차가 초속을 2.92배로 올릴 때
  // 같이 안 올라 초속 대비 반동이 원작의 0.34배로 줄어 있었다. 반동/초속을 원작 비율(8.0/14.0 px/f,
  // 벤치마크 §3·§5)로 묶어 시간축을 또 바꿔도 따라가게 한다 — 현행 793.
  GUARD_AIR_RECOIL_V: Math.round(PLAYER.JUMP_V0 * 8 / 14), // 플레이어 하향 반동 px/s [원작 이식]
  PIN_ESCAPE_V: 850,      // 깔림 '하' 탈출 띄우기
  PIN_MERCY_V: 680,       // 깔림 Z 실패 자비 바운스
  GUARD_ZONE_GROUND: 66,  // building.y ≤ 66(플레이어 키 55 + 여유) 에서 지면 가드 판정
  GUARD_ZONE_AIR: 12,     // |building.y − (footY + PLAYER.H)| ≤ 12
  SPAWN_Y: 720,           // 화면 밖 위
  RESPAWN_TICKS: 45,      // 완파 후 다음 스폰
  // ★08-30 7차: 완파 후 스폰까지의 공백에 아무 신호도 없었다(사용자 영상 판정) — 화면이 빈 채로
  // 0.75초(버터바는 1.5초) 흐르고 건물이 툭 떨어진다. 남은 카운트가 이 값 이하면 예고 마커를 띄운다.
  // 렌더 전용 상수 — 시뮬 타이밍은 안 건드린다. [튜닝]
  SPAWN_CUE_TICKS: 30,
  // 페이즈별 낙하 물리 [g_b px/s², V_TERM px/s]
  ACT1_G: [1530, 3400] as const,       // p=0 → p=1 선형
  ACT1_VTERM: [238, 714] as const,    // 140 + 280·p^0.7
  BUTTER_G: 1020, BUTTER_VTERM: 153,
  CATHEDRAL_G: 4080, CATHEDRAL_VTERM: 952,
  TOWER_G: 1190, TOWER_VTERM: 170,
  ROCK_G: 1700, ROCK_VTERM: 544,
  TOKOTON_G_MAX: 4080, TOKOTON_VTERM_MAX: 952,
} as const;

// ── 무기 [튜닝] ──────────────────────────────────────────────────
// 대미지는 전부 1, 공격 프레임(1/3/2)도 전부 같다 — 체크포인트가 층 HP 합(=타격 수)이고,
// 프레임을 무기마다 바꾸면 3f 입력 버퍼 안에서 탭이 버려진다(10-25 반론 실측: 8탭/s에 오함마 50% 유실).
// 그래서 무기는 세 칸만 바꾼다: 사거리(건물 판정창 위끝) · 띄우기(타격 밀어올림) · 필살 게이지 배율.
//   ⚠ 띄우기 상한: 연타 1주기(7f) 동안 건물이 **1막 어디서든 가라앉아야** 한다 — 안 그러면
//   "연타만으로는 못 버틴다"(STACK.HIT_LIFT_V 주석)가 깨진다. 조건 lift < ACT1_G[0]·8/120 ≈ 102.
//   tests/weapons.test.ts가 지킨다.
//   ⚠ 사거리는 건물(1막·대성당·마천루)에만 먹는다. 2막 표적은 ACT2.REACH·BOSS.HIT_REACH 고정.
// shake = 타격·층붕괴 흔들림 배율(렌더 전용).
export interface WeaponSpec {
  reach: number;
  lift: number;
  gauge: number;
  shake: number;
}
export const WEAPON: Record<WeaponId, WeaponSpec> = {
  sword: { reach: PLAYER.ATTACK_REACH, lift: STACK.HIT_LIFT_V, gauge: 1, shake: 1 },
  hammer: { reach: 60, lift: 95, gauge: 1, shake: 1.6 },     // 띄우기 ↑ / 사거리 ↓
  crowbar: { reach: 88, lift: STACK.HIT_LIFT_V, gauge: 0.8, shake: 1 }, // 사거리 ↑ / 필살 ↓
  grinder: { reach: PLAYER.ATTACK_REACH, lift: 65, gauge: 1.4, shake: 0.8 }, // 필살 ↑ / 띄우기 ↓
  // 대검 — 모두 맞교환(철거칼보다 나은 칸과 못한 칸이 함께 있다). 고르는 맛은 칼날 모양과 손맛
  iron: { reach: 78, lift: STACK.HIT_LIFT_V, gauge: 0.9, shake: 1.2 },   // 사거리 ↑ / 필살 ↓
  saw: { reach: 72, lift: 70, gauge: 1.25, shake: 0.9 },                 // 필살 ↑ / 띄우기 ↓
  hazard: { reach: 76, lift: 88, gauge: 0.85, shake: 1.2 },              // 사거리·띄우기 ↑ / 필살 ↓
  beam: { reach: 64, lift: 98, gauge: 1, shake: 1.7 },                   // 띄우기 ↑↑ / 사거리 ↓
  flame: { reach: 76, lift: 72, gauge: 1.2, shake: 1.1 },                // 사거리·필살 ↑ / 띄우기 ↓
  frost: { reach: 86, lift: 74, gauge: 0.95, shake: 1 },                 // 사거리 ↑↑ / 띄우기 ↓
  onyx: { reach: 92, lift: 92, gauge: 0.7, shake: 1.5 },                 // 사거리·띄우기 ↑↑ / 필살 ↓↓
  gold: { reach: 74, lift: 76, gauge: 1.5, shake: 1.3 },                 // 필살 ↑↑ / 띄우기 ↓
};

// ── 보급 상자 [튜닝] ─────────────────────────────────────────────
// 1막·토코톤 완파 3·8·13…번째에 상자 하나. 바로 지급하고 낙하·열림은 렌더 연출이다
// (한 레인이라 상자는 반드시 졸라맨에게 떨어진다 — 결정 없는 낙하를 시뮬에 둘 이유가 없다).
// 종류는 고정 순서 — 난수(rngState)를 쓰면 스포너 결정성이 흔들린다. 점수 배수·목숨은 넣지 않는다
// (점수 = 1막 진행도 p라 배수가 곧 난이도 가속, 목숨은 광고 부활과 겹침 — 10-25 반론).
export const SUPPLY = {
  EVERY: 5,
  FIRST: 3,
  // 첫 상자가 안전모 — 머리에 보이고 첫 깔림을 막아 줘서 상자가 뭔지 바로 안다
  ROTATION: ['hat', 'coffee', 'gloves', 'dust'] as readonly ItemId[],
  COFFEE_GAUGE: 50,
} as const;

// ── 잔해(파편) 물리 ─────────────────────────────────────────────
export const DEBRIS = {
  GRAVITY: 1780,     // px/s²
  BOUNCE_VY: -0.25,  // 지면 반사 시 vy 감쇠 배수
  BOUNCE_VX: 0.7,    // 지면 반사 시 vx 감쇠 배수
  LIFE_F: 90,        // 층 붕괴 잔해 수명(틱) — 렌더는 이 값 근처로 막 생긴 잔해를 알아본다
} as const;

// ── 재질 HP 테이블 [튜닝] (구조도 계획서 유래 — 원작 대조 없음) ──
export const MAT_HP: Record<string, number> = {
  weak: 1, mid: 2, hard: 3,
  butter: 1,
  cathedral: 5,
  lobby: 10, office: 1, penthouse: 20,
};

// ── 1막 곡선 ────────────────────────────────────────────────────
export const ACT1 = {
  // [검증요] 2막 해금 문턱. 계획서(나무위키) 유래. ⚠원작 save/score.sav 의 저자 1막 최고기록이
  // 17,048,529 로 이 문턱을 넘는다 — "9,999,999에서 2막으로 넘어간다"와 어긋나 보인다.
  // 단 그 기록의 의미(누적/평생 최고 vs 해금 직전값)가 불명이라 모순 확정이 아니라 가설이다.
  UNLOCK_SCORE: 9_999_999,
  FLOORS_MIN: 3, FLOORS_ADD: 7,   // 층수 = 3 + floor(7p)
  // 재질 분포 [p, weak, mid, hard] — 구간 선형 보간
  MAT_DIST: [
    [0.0, 0.70, 0.30, 0.00],
    [0.25, 0.50, 0.40, 0.10],
    [0.5, 0.35, 0.40, 0.25],
    [0.75, 0.25, 0.40, 0.35],
    [1.0, 0.15, 0.35, 0.50],
  ] as const,
  // 챕터 경계 (p) → 챕터 index = 경계 통과 수
  CHAPTER_BOUNDS: [0.25, 0.5, 0.75] as const,
  CHAPTER_THEMES: ['europe', 'asia', 'eastasia', 'modern'] as const,
} as const;

// ── 게이지 경제 [획득식만 정본 제약] ────────────────────────────
// 원작은 게이지가 2개다 (개발자 설명서 + 에셋 bougyobar.bmp / wazabar.bmp 로 확인):
//   방어 게이지(핑크) = 가드 전용 자원, 떨어지면 가드 불가 → 피해
//   기술 게이지(황색) = 콤보로 충전, 필살기 전용
// 두 자원을 합치면 "가드할 때마다 필살기가 깎이는" 전혀 다른 게임이 된다.
export const GUARD_GAUGE = {
  MAX: 100,
  // 아래 3개 = 계획서 20 / 15 / 10 에서 커밋 00c7416이 값만 바꿨는데 그 커밋의 어떤 근거도
  // 이 셋을 설명하지 않는다(같은 커밋의 ×1.7 스케일은 공간축이고 게이지는 시간축이다).
  // 원작 대응값은 §3 델타표에 있다 — 가드 지속이 원작 대비 크게 느슨하다.
  HOLD_DRAIN_PER_S: 22,    // 홀드 중 지속 소모 [검증요]
  BOUNCE_COST_GROUND: 12,  // 바운스 성공 시 추가 소모 [검증요]
  BOUNCE_COST_AIR: 8,      // 공중 가드가 더 싸다 (숙련 보상) [검증요]
  REGEN_PER_S: 14,         // 가드를 놓고 있으면 회복 — 가드는 반복 사용 전제
  REGEN_DELAY_TICKS: 24,   // 가드 해제 후 회복 시작까지
  MIN_TO_GUARD: 8,
} as const;

export const WAZA_GAUGE = {
  MAX: 100,
  // min(10, 1 + floor(combo/10)) — 콤보 90+에서 10/타 = 10타 풀 [튜닝]
  // (원작 필살 문턱은 별도 게이지 300 — 스케일이 다르다. §3)
  PER_HIT_BASE: 1, PER_HIT_DIV: 10, PER_HIT_MAX: 10,
  COST: 100,
} as const;

// ── 필살기 ──────────────────────────────────────────────────────
export const SPECIAL = {
  IFRAMES: 120,           // 발동 프레임부터 무적 [튜닝]
  // (히트스톱은 JUICE.special.hitstop이 단일 출처 — 08-30 이중 정의 제거)
  IMMUNE_DMG: 10,         // 2막 면역 구조물엔 최하층 10대미지만
  MOON_DMG: 10,           // 필살기가 보스에 주는 대미지
  AGEBA_ITER_MAX: 24,     // 올려베기 연속 타격 안전 상한 (HP3×6층 + 여유)
  POSE_TICKS: 48,         // 연출만. 시뮬 파괴는 발동 틱에 끝난다
  AGEBA_FLOORS: 6,        // 올려베기: 발끝에서 위로 최대 층수
  TETSU_V: 1190,          // 철벽: 지면 가드와 같은 띄움. 파괴 없음
} as const;

// ── 구역 작전 기믹 (아케이드 gimmick='none' 이면 미적용) ────────
export const GIMMICK = {
  ICE_BOUNCE_GROUND: 0.7,
  ICE_BOUNCE_AIR: 0.55,
  NIGHT_RESPAWN_MUL: 0.45,
  ORBIT_SPAWN_VY: -120,
  DEFAULT_SPAWN_VY: -70,
  GLASS_EVERY: 2,         // 짝수 층 HP1
  // 특별작전 시작 p [튜닝, B3 봇 실측]. 점수로 주입한다(p = 점수 / 해금 점수).
  // 반드시 작전 배경 챕터 안(유리 0 · 빙결 1 · 야간 2 · 궤도 3)이어야 시작하자마자 버터바로 새지 않는다.
  // 경계 바로 아래는 피한다 — 연타 위주 판은 분당 p가 0.05 가까이 올라 90~150초 창에서 경계를 넘는다.
  START_P: { glass: 0.12, ice: 0.38, night: 0.5, orbit: 0.75 },
} as const;

// ── 점수 [산술 검증: 1,500타 ≈ 7~9분에 9,999,999] ──────────────
export const SCORE = {
  // ★08-30 재보정: 봇 실측 1.01M/10분(리치 68·HIT_LIFT 80·히트스톱 누적으로 저하).
  // 인간 산술: 평균콤보 150·5타/s 기준 30×150×5=22.5K/s → 해금 ≈7.4분(목표 7~9분 밴드).
  // 봇은 콤보 유지를 못해(combo≈4) 하한 가드일 뿐 인간 체감의 대리가 아니다 — 최종은 실플레이.
  BASE_HIT: 30,           // 타격 = 30 × min(combo, 999) (10→20→30, DEVLOG 참조)
  FLOOR_BONUS: 1000,
  DESTROY_BONUS: 5000,
  BOLT_BONUS: 1000,
  CANCEL_BONUS: 1000,
  BOSS_BONUS: 1_000_000,
  CAP: 99_999_999,        // 카운터스톱 [튜닝]
  COMBO_CAP: 999,         // [튜닝]
  BUTTER_DESTROY_PER_LAYER: 1000,
  BUTTER_PERFECT: 50_000,
  GROUND_ROCK_COMBO: false, // 바닥 화산탄 파밍 콤보 (기본 off — 체크포인트 228 보존)
  CARRY_COMBO_TO_ACT2: true, // 콤보 유지 진입 [튜닝]
} as const;

// ── 2막 페이즈 테이블 [튜닝 — checkpoints.test 가드] ────────────
// ⚠ 그 테스트는 표의 산술 자기정합성(30/40/148/168/180/228/230)만 지킨다. 원작 대조가 아니다.
export const ACT2 = {
  INTERLUDE_TICKS: 180,
  CATHEDRAL_FLOORS: 6, CATHEDRAL_HP: 5,   // 6×5 = 30
  TOWER_LOBBY_HP: 10,                      // +10 = 40
  TOWER_OFFICE_FLOORS: 108, TOWER_OFFICE_HP: 1,  // +108 = 148
  TOWER_PENT_HP: 20,                       // +20 = 168
  BOLT_COUNT: 12,                          // +12 = 180
  BOLT_EARLY: 4, BOLT_EARLY_GAP: 90,       // 전반 4발 90f 간격
  BOLT_RHYTHM_GAP: 30,                     // 후반 8발 120BPM = 30f/발
  BOLT_CUE_TICKS: 30,                      // 낙하 30f(500ms) 전 큐
  BOLT_FALL_V: 2000, BOLT_ZONE_V: 600,
  BOLT_ZONE_Y: 160,
  ROCK_COUNT: 24, ROCK_HP: 2,              // +48 = 228 ∈ [220,230]
  ROCK_GAP_START: 120, ROCK_GAP_END: 60,
  ROCK_TIMEBOX_TICKS: 2400,                // 40s
  ROCK_STACK_MAX: 3,                       // 지면 적재 상한 (단일 레인)
  ROCK_PILE_H: 40,                         // 더미 1단 판정 높이(px). ⚠렌더(drawGroundRocks)는 12/16px 소형 — Wave 3 아트 패스에서 정렬
  // 2막 전 대상(번개·화산탄·전기탄·보스·더미) 타격 리치. 1막 ATTACK_REACH(68, 층 1개)와
  // 별개 — 계획서 원명세 128 유지. 08-30 act2.ts 하드코딩에서 config로 승격(수치 무변경).
  REACH: 128,
} as const;

// ── 집행기 보스 [튜닝: 50+100+80=230, 임계 50/150] ──────────────
// "원문 50 100 80"의 원문 = 나무위키 서술이지 원작 파일이 아니다.
export const BOSS = {
  HP: 230,
  TIER1_DMG: 50, TIER2_DMG: 150,
  HOVER_HIGH: 480,        // 타격 불가 고도
  HOVER_LOW: 100,         // 딜 창 고도
  ENTER_Y_OFFSET: 80,     // 등장 시작 높이 = 화면 위 + 이만큼
  RECOVER_TICKS: 60,      // 패턴 종료 회복 틈 (≈6타)
  ROAR_TICKS: 45,         // 티어 전이 무적 포효
  W: VIEW.LANE_W, H: 88,
  // 외형과 판정을 분리한다. 기존 타격 여유 64는 그림 높이와 무관하다.
  HIT_REACH: 64,
  BODY_W: 250, BODY_H: 44, BODY_BOTTOM: 32,
  JAW_W: 30, JAW_H: 44, JAW_X: 115,
  CABLE_X: 82,
  INTRO: { TICKS: 180, ARRIVE: 48, RELEASE: 66, BREAK: 102, CLEAR: 138 },
  CHARGE: { TELE: 40, DESCEND: 30, DASH: 20, STAGGER: 60 },
  PB_CHARGE: { TELEPORT: 6, TELE: 18, DASH: 8, STAGGER: 45, CHAIN_CHANCE: 0.5 },
  MULTI_CHARGE: { COUNT: 3, REAIM: 20, STAGGER: 75 },
  RISE: { BOLT_GAP_5: 45, WAVE_GAP_9: 60, DOWN_WINDOW: 90 },
  RABBIT: { COUNT: 5, ENTER_GAP: 30, FIRE_DELAY: 20, LEAVE: 30, HP: 1, SHOT_V: 480 },
  CANNON: {
    COUNT: 3, AIM_GAP: 40, AIM_TELE: 30, SHOT_V: 700, SPARK_V: 300, SPARK_H: 24, HP: 2,
    MUZZLE_Y: 260,               // 포구 높이(px) — 전기탄이 생기는 곳이자 대포의 타격 높이. 렌더도 이 높이에 그린다
    X: [80, 180, 280] as const,  // 좌/중/우 설치 x — 가운데만 직격, 양옆은 스파크 위협
  },
  // 격파 뒤 파티클·카메라만 DEFEAT_SLOW배속으로 시작해 DEFEAT_SLOW_S초에 걸쳐 1배로 돌아온다(렌더 전용 — core 틱 불변).
  DEFEAT_SLOW: 0.2, DEFEAT_SLOW_S: 3,
  DEFEAT_SPLIT_TICK: 20,  // 격파 몸체가 갈라지기 시작하는 틱 — 흔들림 한 번 더 (렌더 전용)
  /** 격파 연출 낙하 잔해 수 (타격=콤보만, 점수 없음). [검증요] — 잔해 규칙만 계획서에
   *  있고 개수 4는 레포 어디에도 근거가 없다. 누가 정했는지 불명. */
  DEFEAT_REMNANT: 4,
} as const;

// ── 버터바 이벤트 스테이지 ──────────────────────────────────────
export const BONUS = {
  DURATION_TICKS: 1800,   // 30s
  BANNER_TICKS: 180,      // "버터바 타임!" 3s
  // 회차별 스폰 큐 (겹수 배열)
  ROUNDS: [
    [1, 1, 1, 1, 3, 3, 3, 3],
    [3, 3, 3, 3, 10, 10, 10],
    [10, 10, 10, 100],
  ] as const,
  TOKOTON_ROUND: [100, 100] as const,  // 4회차+ 반복
  SPAWN_GAP: 90,
} as const;

// ── 토코톤 ──────────────────────────────────────────────────────
export const TOKOTON = {
  // p = min(2, score/UNLOCK + elapsedMin/10)
  P_PER_MIN: 0.1,
  P_MAX: 2,
  CHAPTER_CYCLE_TICKS: 7200,  // 해금 챕터 2분 순환
} as const;

// ── 타격감 (JUICE 매트릭스 — 계획 §타격감) ──────────────────────
export interface JuiceSpec {
  hitstop: number;      // f
  shake: number;        // px — 흔들림 첫 프레임 진폭(실측 0.7~1.0배). 곡선은 선형, 반감기는 SHAKE_HALF_LIFE_F
  flash: number;        // f (0=없음)
  particles: number;
}
// ⚠ 이 표의 키가 core 이벤트 이름과 같으면 core(sim advance 말미)가 hitstop을 주입한다.
//   아래 `보스 연출 · 렌더 전용` 키(bossBreak·bossRoar·bossSplit)는 이벤트가 아니라 렌더가 상태를 읽어 쓰는 값이다.
export const JUICE: Record<string, JuiceSpec> = {
  slash:          { hitstop: 0, shake: 0, flash: 0, particles: 0 },
  hit:            { hitstop: 2, shake: 2, flash: 2, particles: 5 },
  floorCollapse:  { hitstop: 3, shake: 5, flash: 2, particles: 10 },
  // 완파는 층수(e.n)로 키운다 — JUICE_SYS.STACK_K_*. 이 값은 k=1(2층) 기준.
  stackDestroy:   { hitstop: 6, shake: 8, flash: 0, particles: 24 },
  butterCollapse: { hitstop: 2, shake: 3, flash: 2, particles: 8 },
  special:        { hitstop: 10, shake: 16, flash: 4, particles: 32 },
  hurt:           { hitstop: 4, shake: 8, flash: 3, particles: 4 },
  // 밑면 충돌 — 막혔다는 걸 손에 알리되 타격보다 약하게(적을 친 게 아니다)
  headBonk:       { hitstop: 1, shake: 2, flash: 0, particles: 4 },
  guardBounce:    { hitstop: 1, shake: 2.5, flash: 2, particles: 3 },
  guardAirBounce: { hitstop: 2, shake: 3.5, flash: 3, particles: 5 },
  // 보스전은 몸체 반응(지터·아이보리)이 번쩍을 대신한다 — 1막용 잉크 전체 번쩍은 뺀다(flash 0).
  bossHit:        { hitstop: 2, shake: 1.5, flash: 0, particles: 4 },
  bossDefeat:     { hitstop: 30, shake: 18, flash: 4, particles: 64 },
  // ⚠ 히트스톱 0 고정: 게이지 없이 필살을 연타하면 매번 나오는 이벤트라 멈춤이 붙으면 시뮬이 선다(B-10).
  guardDenied:    { hitstop: 0, shake: 1, flash: 0, particles: 0 },
  supply:         { hitstop: 0, shake: 0, flash: 0, particles: 8 },
  hatBreak:       { hitstop: 3, shake: 5, flash: 0, particles: 10 },
  // 번개 착탄(hurt가 따로 붙는다) — 땅에 꽂히는 순간 불꽃·먼지
  boltStrike:     { hitstop: 0, shake: 6, flash: 2, particles: 10 },
  // ── 보스 연출 · 렌더 전용 ──
  bossBreak:      { hitstop: 0, shake: 10, flash: 0, particles: 12 },  // 입장 BREAK 틱: 물고 온 층이 부서진다
  bossRoar:       { hitstop: 0, shake: 10, flash: 0, particles: 0 },   // 티어 포효 시작(phaseClear n>=100)
  bossSplit:      { hitstop: 0, shake: 8, flash: 0, particles: 0 },   // 격파 몸체가 갈라지기 시작
};
export const JUICE_SYS = {
  SHAKE_MAX_AMP: 18,
  SHAKE_HALF_LIFE_F: 8,
  PARTICLE_POOL: 384,
  ONOMATOPOEIA_MAX: 3,    // 동시 의성어 팝업 상한
  COMBO_POPUP_MAX: 16,    // 동시 콤보 숫자 팝업 상한 (원작: 타격마다 숫자가 흩뿌려짐)
  COMBO_POPUP_LIFE_F: 26, // 숫자 팝업 수명(프레임)
  COMBO_POPUP_PX: 15,     // 숫자 팝업 기본 글자 크기(px) — 13에서 키웠다
  PITCH_JITTER: 0.06,     // SFX 피치 ±6%
  PITCH_STEP_PER_10_COMBO: 1, // 반음
  // 완파 규모 k = clamp(BASE + 층수 × PER_FLOOR, BASE, MAX) — 흔들림·파편·링·팝업을 k배
  STACK_K_BASE: 0.8, STACK_K_PER_FLOOR: 0.1, STACK_K_MAX: 1.8,
  STACK_RING_FLOORS: 3,   // 이 층수 이상이면 노랑 링 한 줄 추가
  // 번쩍 강도(설정 flashLevel 0 끔 · 1 약 · 2 기본) — 알파에 곱한다
  FLASH_LEVEL_MUL: [0, 0.5, 1] as const,
  // 몸 반응(발 기준 눌림) — 착지는 세로, 점프는 가로
  SQUASH_TICKS: 3, SQUASH_LAND_Y: 0.9, SQUASH_JUMP_X: 0.92,
  LAND_DUST: 4,
  // 종이 오려내기 후광 — 오프스크린 캐시는 캔버스 DPR과 무관하게 고정 HALO_SS배
  HALO_PX: 1.75, HALO_SS: 2,
  // 필살 예비동작 — 유령 알파·링 수축 시작 반지름 (길이는 JUICE.special.hitstop)
  PRELUDE_GHOST_ALPHA: 0.5, PRELUDE_RING_R: 150,
  // 사망 — 붉은 번쩍 틱·파티클 배속·틀 지속
  DEATH_FLASH_TICKS: 8, DEATH_SLOW: 0.3, DEATH_SLOW_TICKS: 24, DEATH_FRAME_TICKS: 18,
  // 공사 테이프 2줄(보스 포효) 지속 틱
  TAPE_TICKS: 16,
  // 구역작전 시각 시그니처(렌더 전용 · 노랑 0) — core의 gimmick은 읽기만 한다
  NIGHT_WASH_A: 0.12,          // night: 필드 잉크 워시 알파(배경 위 INK 12% = 실효 #DAD7D0)
  NIGHT_WINDOW_MAX_AREA: 900,  // night: 이 면적(2배 굽기 픽셀) 이하로 닫힌 칸을 창으로 보고 잉크로 채운다
  ORBIT_BEAM_A: 0.55,          // orbit: 직하 헤어라인(1px) 알파
  ORBIT_FLASH_A: 0.3, ORBIT_FLASH_TICKS: 4, // orbit: 건물이 궤도에서 풀리는 순간 아이보리 번쩍
  GLASS_CHIPS: 12, GLASS_CHIPS_HIT: 3,       // glass: 층 붕괴 / 타격 때 유리 조각 수
  ICE_SPARKS: 12,               // ice: 지면 가드 차가운 스파크 수
  // ── 파괴 연출 2판(10-28) — 전부 렌더 전용. 시뮬 타이밍(hitstop)은 위 표 그대로 ──
  // 흔들림: 같은 크기가 겹치면 큰 쪽 + 작은 쪽의 STACK배만 더한다(연타가 끝없이 쌓이지 않게). 회전은 진폭 비율의 제곱.
  SHAKE_STACK: 0.35, SHAKE_ROT_MAX: 0.035,
  // 방향 킥(px) — 아래에서 위로 베니 화면이 위로 툭 튀었다 용수철로 돌아온다
  KICK_PX: { hit: 3, floorCollapse: 5, stackDestroy: 7, butterCollapse: 3, bossHit: 2 } as Record<string, number>,
  KICK_SPRING: 0.3, KICK_DAMP: 0.45,
  // 맞은 층 하얗게 번쩍(틱 · 알파) — 화면 전체가 아니라 그 층만
  HIT_FLASH_TICKS: 3, HIT_FLASH_A: 0.75,
  // 층 조각: 층 그림을 가로 COLS × 세로 ROWS 칸으로 자르고 칸 일부는 대각선으로 한 번 더 자른다
  FRAG_COLS: 3, FRAG_ROWS: 2, FRAG_LIFE: 1.05, FRAG_G: 1150,
  // 만화 먼지 구름 수 — 층 붕괴 / 완파
  PUFF_COLLAPSE: 3, PUFF_DESTROY: 8,
  // 타격 별 반지름(px)
  STAR_PX: { hit: 13, floorCollapse: 24, stackDestroy: 38, butterCollapse: 16 } as Record<string, number>,
  // 집중선 · 색 반전(완파 IMPACT_FLOORS층 이상 · 필살 · 보스 격파). 반전은 COOLDOWN 틱에 한 번만
  IMPACT_TICKS: 8, INVERT_TICKS: 2, IMPACT_FLOORS: 3, INVERT_COOLDOWN: 45,
  // 콤보 열기 — 이 콤보부터 필드 양옆에 속도선이 선다(단계마다 진해진다)
  HEAT_COMBO: [30, 60, 120, 250] as const,
  // 의성어 글자 기본 크기(px) · 등장 튐 배율 · 등장 틱
  ONOMATO_PX: 20, ONOMATO_POP: 1.8, ONOMATO_POP_TICKS: 5,
  // 새 건물이 막 나타난 뒤 양옆에 남는 낙하 선(틱)
  DROP_STREAK_TICKS: 22,
  // 예능 자막(완파 층수 · 콤보 고비) 지속 틱 — 박혀 들어오기 6 · 빠지기 7 포함
  CAPTION_TICKS: 50,
} as const;

// ── 진동 패턴 (podoal feedback.ts 차용) ─────────────────────────
// 숫자 = ms 한 번, 배열 = [진동, 휴지, 진동, …] (웹 Vibration API와 같은 문법 — 네이티브도 세그먼트로 풀어 쏜다).
// 한 틱에 여러 개가 겹치면 총 길이가 가장 긴 패턴 하나만 쏜다(renderer pickHaptic).
export const HAPTIC = {
  hit: 14, floorCollapse: 20, stackDestroy: [30, 20, 30],
  butterCollapse: 10, special: [100, 50, 200], hurt: 60,
  guardBounce: 15, headBonk: 12, bossDefeat: [100, 50, 100, 50, 200],
  supply: 10, hatBreak: [30, 20, 30], pinEscape: [20, 30, 20],
  bossHit: 14, lifeLost: [60, 40, 90], gaugeFull: [12, 30, 12], guardDenied: 10,
  boltStrike: 25, bonusPerfect: [20, 30, 20, 30, 40], phaseClear: [20, 30, 40],
  HIT_THROTTLE: 3,        // 연타 시 3회당 1회 (hit·bossHit는 카운터를 따로 쓴다)
} as const;

// ── 코스메틱 색 (P1-3 실구현 — 팔리는 물건은 실제로 바뀐다) ─────
// body = 졸라맨 선 색 / blade = 참격 궤적·스파크 색 / letters = 콤보 팝업 기본 색.
export const COSMETIC_COLORS = {
  body: { ink: '#1A1A20', amber: '#B4690E', slate: '#3E5A82' } as Record<string, string>,
  blade: { wire: '#FFD200', rebar: '#E5302E', crescent: '#4FD8E8' } as Record<string, string>,
  letters: { flyer: '#1A1A20', stamp: '#C22A26', orbit: '#1E62D0' } as Record<string, string>,
} as const;

// ── 브랜드 팔레트 ───────────────────────────────────────────────
// ★명도 위계 (2026-08-30 7차, 사용자 영상 판정 "캐릭터가 잔해에 파묻힌다"):
//   캐릭터는 **선만 있는 졸라맨**이라 면 채움과 명도로만 싸운다. 그래서 규칙 하나 —
//   **잉크(INK)가 화면에서 제일 어두워야 한다.** 어떤 면 채움도 INK보다 밝게 잡는다.
//   현행 위계: BG #F4F1E8 > RUBBLE #9A958C > TILE_EDGE #4A4740(sprites.ts) > INK #1A1A20.
export const PALETTE = {
  BG: '#F4F1E8',
  INK: '#1A1A20',
  RED: '#E5302E', YELLOW: '#FFD200', BLUE: '#1E62D0',
  YELLOW_DEEP: '#E39E00', // 필드 위 글씨(의성어·콤보 숫자) 채움 — YELLOW는 너무 밝아 빨리 지나가면 안 보였다(10-28 사용자)
  WHITE: '#F4F1E8',
  RUBBLE: '#9A958C',     // 잔해 채움 [튜닝] — 구 #3A3A42 는 INK와 명도가 붙어 캐릭터를 삼켰다
} as const;

// ── 저장 ────────────────────────────────────────────────────────
export const SAVE_KEY = 'gunbbu.v1';

// ── 소리 (B1) ───────────────────────────────────────────────────
// 믹스: 마스터 컴프레서(덜 누름) → 리미터(클리핑만 막음). 수치는 OfflineAudioContext 렌더로 잰 출발점.
export const AUDIO = {
  COMP: { THRESHOLD: -16, KNEE: 8, RATIO: 3.5, ATTACK: 0.004, RELEASE: 0.2 },
  LIMIT: { THRESHOLD: -2, KNEE: 0, RATIO: 20, ATTACK: 0.001, RELEASE: 0.1 },
  SFX_BUS: 0.9,
  BGM_BUS: 0.5,
  /** 스케줄러 — 룩어헤드 0.2초·인터벌 25ms. 이만큼 이상 밀리면 따라잡지 않고 건너뛴다. */
  LOOKAHEAD_MS: 25,
  SCHEDULE_AHEAD_S: 0.2,
  LATE_SKIP_S: 0.05,
  /** 켜고 끄는 페이드(클릭 팝 방지) · 음악 정지 페이드 */
  FADE_TC: 0.02,
  STOP_FADE_S: 0.12,
  /** BGM 덕킹 — 메뉴(일시정지·설정·광고 대기)는 상시, 필살·보스 격파는 0.3초 */
  DUCK_MENU: 0.3,
  DUCK_PULSE: 0.35,
  DUCK_PULSE_S: 0.3,
  DUCK_TC: 0.05,
  /** 건물 완파 덕킹 — 필살보다 가볍게 0.25초 */
  DUCK_DESTROY: 0.55,
  DUCK_DESTROY_S: 0.25,
  /** 콤보 층 — 햇 8분 / 아르페지오. 마디 경계에서만 켜고 끈다. */
  COMBO_HAT: 50,
  COMBO_ARP: 150,
  /** 멜로디 이중 발음 detune(±cent) */
  DETUNE_CENTS: 6,
  /** BGM 음량 — MEL은 이중 발음 한 쪽 몫. 킥 스텝에선 멜로디를 KICK_MEL_MUL배로 눌러 피크를 낮춘다. */
  LEVEL: { MEL: 0.14, BASS: 0.3, KICK: 0.4, HAT: 0.18, KICK_MEL_MUL: 0.7, LAYER_HAT: 0.1, LAYER_ARP: 0.08 },
  /** 콤보 이정표 — 경계 통과 때 한 번 */
  MILESTONES: [50, 100, 200, 500, 999],
  /** 한 틱에 이만큼보다 크게 뛴 콤보는 타격이 아니다(이어하기) — 이정표로 세지 않는다 */
  MILESTONE_MAX_JUMP: 5,
  /** 타격음 피치 사다리 — 장조 펜타토닉, 상한 +7반음, 내려가지 않는다 */
  PITCH_LADDER: [0, 2, 4, 7],
  PITCH_STEP_COMBO: 10,
  /** 판 종료 신호음 — 목숨 소리(lifeLost)가 끝난 뒤 */
  RUN_END_DELAY: 0.5,
} as const;

// ── 화면 흐름 (B2) ──────────────────────────────────────────────
// 틱 = 1/60초. 결과 카드·이야기 판이 뜨는 박자.
export const UI_FLOW = {
  /** 마지막 목숨을 잃고 결과 카드가 뜨기까지 — 그동안 캔버스는 계속 그린다 */
  GAMEOVER_CARD_DELAY: 30,
  /** 카드가 뜬 뒤 연타가 새 판으로 번지지 않게 입력을 잠그는 틱 */
  GAMEOVER_LOCK: 24,
  /** 이야기 판 진입 테이프 와이프 — 구역·막 전환 0.25초, 보스 격파 0.4초 */
  WIPE_TICKS: 15,
  WIPE_BOSS_TICKS: 24,
} as const;

// ── 작전 · 자격 · 첫 판 안내 (B3) ──────────────────────────────
// 특별작전 등급 — 시작 p는 GIMMICK.START_P. 가드 봇 5시드 실측(tests/ops.test.ts)으로 맞췄다:
// B는 5시드 중 4 이상, S는 1 이하. 건물 작전은 한도 안에 부순 채 수, 버티기 작전은 버틴 초가 값이다.
export const OPERATION = {
  glass: { limitSec: 90, metric: 'buildings', grade: { B: 14, A: 18, S: 23 } },
  ice: { limitSec: 120, metric: 'buildings', grade: { B: 15, A: 20, S: 26 } },
  night: { limitSec: 150, metric: 'buildings', grade: { B: 13, A: 17, S: 22 } },
  orbit: { limitSec: 60, metric: 'seconds', grade: { B: 20, A: 35, S: 60 } },
} as const;

export const TEACH = {
  /** 평생 첫 목숨 손실 때 판을 멈추는 틱 — 가드 가르치기 */
  GUARD_FREEZE_TICKS: 90,
  /** 가드 버튼 맥동을 유지하는 최대 틱 (가드를 누르면 바로 끝) */
  GUARD_PULSE_TICKS: 360,
} as const;

/** 구역 인트로 사다리 — 같은 세션에서 아케이드를 시작한 횟수로 고른다 */
export const INTRO = {
  /** 첫 판: 석 줄 + 평생 첫 판에만 숨은 줄 */
  FIRST_TICKS: 60 * 3,
  /** 2~4판째: 한 줄 */
  SHORT_TICKS: 60 * 2,
  SHORT_UNTIL: 4,
  /** 5판째부터: 머리말만 0.8초 */
  HEAD_TICKS: 48,
} as const;

/** 판 도중 자막(콤보 이정표·기록 돌파·구역 도달) 지속 */
export const CAPTION_MS = 1200;

/** 게임오버 만담 — 같은 세션 연속 사망이 이 횟수부터 사다리 */
export const QUIP_STREAK_FROM = 3;

// ── 마스크 (상점 꾸미기) ─────────────────────────────────────────
/**
 * 머리에 씌우는 크기 [튜닝]. SIZE = 16칸이 차지하는 논리 px — 머리 지름 10의 1.6배(큰 머리 연출).
 * LIFT = 머리 중심보다 위로(목이 마스크 밑에서 이어지게). FLAT_SQUASH = 깔림·사망 납작 프레임에서 세로 배율.
 * HAT_UP = 마스크 위 안전모가 마스크 중심보다 올라가는 px(윗단만 덮는다).
 */
export const MASK_DRAW = { SIZE: 16, LIFT: 2, FLAT_SQUASH: 0.45, HAT_UP: 5 } as const;
