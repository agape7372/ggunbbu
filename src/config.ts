// 건뿌 — 전 튜닝 상수 단일 출처.
//
// ★2026-08-30 딱지 재분류. 이 파일의 어떤 숫자도 원작 exe 근거가 없다.
// 예전 [정본] 딱지 15건은 전부 계획 정본(나무위키 서술 기반 계획서)에서 왔고,
// 프로젝트 최초 커밋부터 검토 없이 존재하다가 값만 드리프트했다. 전량 강등했다.
//   [튜닝]   = 리메이크 밸런싱. 유래가 문서화된 값 (원작 근거 없음 ≠ 나쁜 값)
//   [검증요] = 유래 불명 드리프트. 왜 이 값인지 아무도 모른다 — 재판정 대상
// 원작 실측값과의 대조는 docs/ORIGINAL_BENCHMARK_2026-08-30.md §3 델타표가 정본이다.
// 여기에 원작 숫자를 복사하지 마라 — 사본이 늘면 그게 다음 드리프트다.
// ⚠ src/core/·tests/ 의 [정본] 56건은 아직 미감사다(행동 불변식 주장 위주).
// 체크포인트 산술(30/40/148/168/180/228/230)은 tests/checkpoints.test.ts가 가드한다.

export const TICK = 1 / 60;
export const TPS = 60;

// ── 화면/좌표 (논리 캔버스, 물리 y축: 지면=0, 위가 +) ─────────────
// ★08-30 사용자 지시("공간 너무 낭비야. 플레이화면이 더 넓어야지"): 논리 캔버스를 세로로 늘려
// 요즘 폰(19.5:9)에서 위아래로 남던 죽은 띠를 필드로 돌린다. 375×812 기준 배율이
// min(375/360, 812/780)=1.041 이 되어 띠가 사실상 0이 되고, 필드는 화면상 489px → 635px(+30%).
// ★시뮬은 안 건드린다 — FIELD_H/GROUND_Y는 렌더 뷰포트 상수고 core는 자기 단위(지면=0)로 돈다.
// 조작 존 높이(170)는 그대로. 점프 정점 371px는 여전히 필드 안(camera.test가 가드).
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
} as const;

// ── 카메라 (렌더 전용. 시뮬 y는 그대로) ─────────────────────────
// ★08-30 재설계: "발 1:1 추종(max(0, y-140))"을 실측 근거로 폐기 — QA 계측에서 체공의
// 75.9% 동안 지면·번개 예고·대포가 화면 밖이었다(ROADMAP_2026-08-30.md Wave 0).
// 새 규칙: 플레이어가 필드 상단을 뚫으려 할 때만 최소로 딸려 올라간다. 정점이 필드 안이면
// cam=0 — 지면과 예고 마커가 항상 보인다. 이 기록 없이 추종 카메라로 되돌리지 말 것.
export const CAMERA = {
  HEADROOM: 24,          // 플레이어 머리 위 여유(px)
} as const;

// ── 플레이어 물리 ───────────────────────────────────────────────
export const PLAYER = {
  // ★2026-08-30 사용자 확정: **원작 물리 도입**. 원작 실측(벤치마크 §3: 초속 840px/s ·
  // 중력 360px/s² · 정점 980px=8.2층 · 체공 4.67s)을 층 비율 68/120 로 스케일해 이식.
  // 환산 기준은 벤치마크가 정한 "몇 층까지 닿는가" — 정점 555px = 8.2층으로 층 단위 일치,
  // 체공은 시간축이라 스케일 불변(4.67s = 280f).
  // ⚠이 도입이 깨는 구 설계 전제 2개(사용자 결정으로 수용): ① 체공 280f > HIT_IFRAMES 90f
  // (구 "체공 < 무적창" 제약 폐기) ② 정점+키+여유가 필드를 24px 넘어 정점 부근에서만
  // 카메라가 최소 추종(camera.ts 기존 클램프가 그대로 처리, 지면은 계속 보인다).
  // 이전 값 1150/1780(정점 371px)의 경위는 git과 ROADMAP Wave 0에 있다.
  GRAVITY: 204,           // px/s² [원작 이식] = 360 × 68/120
  JUMP_V0: 476,           // px/s  [원작 이식] = 840 × 68/120
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
  GUARD_AIR_RECOIL_V: 272, // 플레이어 하향 반동 px/s [원작 이식] = 480 × 68/120
  PIN_ESCAPE_V: 850,      // 깔림 '하' 탈출 띄우기
  PIN_MERCY_V: 680,       // 깔림 Z 실패 자비 바운스
  GUARD_ZONE_GROUND: 66,  // building.y ≤ 66(플레이어 키 55 + 여유) 에서 지면 가드 판정
  GUARD_ZONE_AIR: 12,     // |building.y − (footY + PLAYER.H)| ≤ 12
  SPAWN_Y: 720,           // 화면 밖 위
  RESPAWN_TICKS: 45,      // 완파 후 다음 스폰
  // 페이즈별 낙하 물리 [g_b px/s², V_TERM px/s]
  ACT1_G: [1530, 3400] as const,       // p=0 → p=1 선형
  ACT1_VTERM: [238, 714] as const,    // 140 + 280·p^0.7
  BUTTER_G: 1020, BUTTER_VTERM: 153,
  CATHEDRAL_G: 4080, CATHEDRAL_VTERM: 952,
  TOWER_G: 1190, TOWER_VTERM: 170,
  ROCK_G: 1700, ROCK_VTERM: 544,
  TOKOTON_G_MAX: 4080, TOKOTON_VTERM_MAX: 952,
} as const;

// ── 잔해(파편) 물리 ─────────────────────────────────────────────
export const DEBRIS = {
  GRAVITY: 1780,     // px/s²
  BOUNCE_VY: -0.25,  // 지면 반사 시 vy 감쇠 배수
  BOUNCE_VX: 0.7,    // 지면 반사 시 vx 감쇠 배수
  LIFE_F: 90,        // 소멸까지 수명(프레임)
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
  MOON_DMG: 10,
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
  BOLT_ZONE_Y: 160, BOLT_ZONE_TICKS: 16,   // 존 통과 16f = 타격 창
  ROCK_COUNT: 24, ROCK_HP: 2,              // +48 = 228 ∈ [220,230]
  ROCK_GAP_START: 120, ROCK_GAP_END: 60,
  ROCK_TIMEBOX_TICKS: 2400,                // 40s
  ROCK_STACK_MAX: 3,                       // 지면 적재 상한 (단일 레인)
  ROCK_PILE_H: 40,                         // 더미 1단 판정 높이(px). ⚠렌더(drawGroundRocks)는 12/16px 소형 — Wave 3 아트 패스에서 정렬
  // 2막 전 대상(번개·화산탄·전기탄·보스·더미) 타격 리치. 1막 ATTACK_REACH(68, 층 1개)와
  // 별개 — 계획서 원명세 128 유지. 08-30 act2.ts 하드코딩에서 config로 승격(수치 무변경).
  REACH: 128,
  CHECKPOINTS: [40, 148, 168] as const,    // 이어하기 콤보 재설정 값
} as const;

// ── 달 보스 [튜닝: 50+100+80=230, 임계 50/150] ──────────────────
// "원문 50 100 80"의 원문 = 나무위키 서술이지 원작 파일이 아니다.
export const BOSS = {
  HP: 230,
  TIER1_DMG: 50, TIER2_DMG: 150,
  HOVER_HIGH: 480,        // 타격 불가 고도
  HOVER_LOW: 100,         // 딜 창 고도
  RECOVER_TICKS: 60,      // 패턴 종료 회복 틈 (≈6타)
  ROAR_TICKS: 45,         // 티어 전이 무적 포효
  W: 80, H: 64,
  CHARGE: { TELE: 40, DESCEND: 30, DASH: 20, STAGGER: 60 },
  PB_CHARGE: { TELEPORT: 6, TELE: 18, DASH: 8, STAGGER: 45, CHAIN_CHANCE: 0.5 },
  MULTI_CHARGE: { COUNT: 3, REAIM: 20, STAGGER: 75 },
  RISE: { UP: 60, BOLT_GAP_5: 45, WAVE_GAP_9: 60, DOWN_WINDOW: 90 },
  RABBIT: { COUNT: 5, ENTER_GAP: 30, FIRE_DELAY: 20, LEAVE: 30, HP: 1, SHOT_V: 480 },
  CANNON: {
    COUNT: 3, AIM_GAP: 40, AIM_TELE: 30, SHOT_V: 700, SPARK_V: 300, SPARK_H: 24, HP: 2,
    X: [80, 180, 280] as const,  // 좌/중/우 설치 x — 가운데만 직격, 양옆은 스파크 위협
  },
  DEFEAT_SLOW: 0.2, DEFEAT_SLOW_S: 3,
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
  shake: number;        // px (trauma 가산량은 shake/MAX_AMP)
  flash: number;        // f (0=없음)
  particles: number;
}
export const JUICE: Record<string, JuiceSpec> = {
  slash:          { hitstop: 0, shake: 0, flash: 0, particles: 0 },
  hit:            { hitstop: 2, shake: 1, flash: 2, particles: 5 },
  floorCollapse:  { hitstop: 3, shake: 3, flash: 2, particles: 10 },
  stackDestroy:   { hitstop: 6, shake: 6, flash: 0, particles: 24 },
  butterCollapse: { hitstop: 2, shake: 2, flash: 2, particles: 8 },
  special:        { hitstop: 10, shake: 14, flash: 4, particles: 32 },
  hurt:           { hitstop: 4, shake: 8, flash: 3, particles: 4 },
  // 밑면 충돌 — 막혔다는 걸 손에 알리되 타격보다 약하게(적을 친 게 아니다)
  headBonk:       { hitstop: 1, shake: 2, flash: 0, particles: 4 },
  guardBounce:    { hitstop: 1, shake: 2, flash: 2, particles: 3 },
  guardAirBounce: { hitstop: 2, shake: 3, flash: 3, particles: 5 },
  bossHit:        { hitstop: 2, shake: 1, flash: 2, particles: 4 },
  bossDefeat:     { hitstop: 30, shake: 12, flash: 4, particles: 64 },
};
export const JUICE_SYS = {
  SHAKE_MAX_AMP: 12,
  SHAKE_HALF_LIFE_F: 6,
  PARTICLE_POOL: 256,
  ONOMATOPOEIA_MAX: 3,    // 동시 의성어 팝업 상한
  COMBO_POPUP_MAX: 16,    // 동시 콤보 숫자 팝업 상한 (원작: 타격마다 숫자가 흩뿌려짐)
  COMBO_POPUP_LIFE_F: 26, // 숫자 팝업 수명(프레임)
  PITCH_JITTER: 0.06,     // SFX 피치 ±6%
  PITCH_STEP_PER_10_COMBO: 1, // 반음
} as const;

// ── 진동 패턴 (podoal feedback.ts 차용) ─────────────────────────
export const HAPTIC = {
  hit: 8, floorCollapse: 20, stackDestroy: [30, 20, 30],
  butterCollapse: 10, special: [100, 50, 200], hurt: 60,
  guardBounce: 15, headBonk: 12, bossDefeat: [100, 50, 100, 50, 200],
  HIT_THROTTLE: 3,        // 연타 시 3회당 1회
} as const;

// ── 코스메틱 색 (P1-3 실구현 — 팔리는 물건은 실제로 바뀐다) ─────
// body = 졸라맨 선 색 / blade = 참격 궤적·스파크 색 / letters = 콤보 팝업 기본 색.
export const COSMETIC_COLORS = {
  body: { ink: '#1A1A20', amber: '#B4690E', slate: '#3E5A82' } as Record<string, string>,
  blade: { wire: '#FFD200', rebar: '#E5302E', crescent: '#4FD8E8' } as Record<string, string>,
  letters: { flyer: '#1A1A20', stamp: '#C22A26', orbit: '#1E62D0' } as Record<string, string>,
} as const;

// ── 브랜드 팔레트 ───────────────────────────────────────────────
export const PALETTE = {
  BG: '#F4F1E8',
  INK: '#1A1A20',
  RED: '#E5302E', YELLOW: '#FFD200', BLUE: '#1E62D0',
  WHITE: '#F4F1E8',
} as const;

// ── 저장 ────────────────────────────────────────────────────────
export const SAVE_KEY = 'gunbbu.v1';
