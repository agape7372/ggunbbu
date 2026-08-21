// 건뿌 — 전 튜닝 상수 단일 출처.
// [정본] = 원작 명시 수치(변경 금지). 나머지 = 설계 초기값(튜닝 대상).
// 체크포인트 산술(30/40/148/168/180/228/230)은 tests/checkpoints.test.ts가 가드한다.

export const TICK = 1 / 60;
export const TPS = 60;

// ── 화면/좌표 (논리 캔버스, 물리 y축: 지면=0, 위가 +) ─────────────
export const VIEW = {
  W: 360,
  H: 640,
  FIELD_H: 470,          // 상단 게임 필드, 하단은 조작 존
  LANE_W: 120,
  LANE_X: [60, 180, 300] as const,  // 레인 중심
  FLOOR_H: 40,
  GROUND_Y: 470,         // 캔버스 픽셀상 지면 라인 (렌더 변환용)
} as const;

// ── 플레이어 물리 ───────────────────────────────────────────────
export const PLAYER = {
  GRAVITY: 1780,          // px/s²
  JUMP_V0: 800,           // 정점 ≈180px, 체공 ≈0.9s — "매우 높은 점프" [정본 느낌]
  W: 40, H: 48,
  LANE_TWEEN_MS: 60,      // 시각 보간 전용 (논리 즉시)
  ATTACK_REACH: 128,      // 발 기준 위
  ATTACK_PRE: 2, ATTACK_ACTIVE: 4, ATTACK_POST: 3,  // 총 9f = 150ms
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
  HIT_LIFT_V: 170,        // 타격 밀어올림: vy = max(vy, +170)
  GUARD_GROUND_V: 700,    // 지면 가드 바운스 [정본: 높이 띄움]
  GUARD_AIR_V: 400,       // 공중 가드 바운스 [정본: 낮게 띄움]
  PIN_ESCAPE_V: 500,      // 깔림 '하' 탈출 띄우기
  PIN_MERCY_V: 400,       // 깔림 Z 실패 자비 바운스
  GUARD_ZONE_GROUND: 56,  // building.y ≤ 56 에서 지면 가드 판정
  GUARD_ZONE_AIR: 12,     // |building.y − (footY+48)| ≤ 12
  SPAWN_Y: 660,           // 화면 밖 위
  RESPAWN_TICKS: 45,      // 완파 후 다음 스폰
  // 페이즈별 낙하 물리 [g_b px/s², V_TERM px/s]
  ACT1_G: [900, 2000] as const,       // p=0 → p=1 선형
  ACT1_VTERM: [140, 420] as const,    // 140 + 280·p^0.7
  BUTTER_G: 600, BUTTER_VTERM: 90,
  CATHEDRAL_G: 2400, CATHEDRAL_VTERM: 560,
  TOWER_G: 700, TOWER_VTERM: 100,
  ROCK_G: 1000, ROCK_VTERM: 320,
  TOKOTON_G_MAX: 2400, TOKOTON_VTERM_MAX: 560,
} as const;

// ── 재질 HP 테이블 [정본 구조] ──────────────────────────────────
export const MAT_HP: Record<string, number> = {
  weak: 1, mid: 2, hard: 3,
  butter: 1,
  cathedral: 5,
  lobby: 10, office: 1, penthouse: 20,
};

// ── 1막 곡선 ────────────────────────────────────────────────────
export const ACT1 = {
  UNLOCK_SCORE: 9_999_999,        // [정본] 2막 해금
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
export const GAUGE = {
  MAX: 100,
  // min(10, 1 + floor(combo/10)) — 콤보 90+에서 10/타 = 10타 풀 [정본 충족]
  PER_HIT_BASE: 1, PER_HIT_DIV: 10, PER_HIT_MAX: 10,
  HOLD_DRAIN_PER_S: 20,   // [정본: 지속 소모]
  BOUNCE_COST_GROUND: 15, // [정본: 성공 시 추가 소모]
  BOUNCE_COST_AIR: 10,
  MIN_TO_GUARD: 10,       // [정본: 최소 게이지 필요]
  SPECIAL_COST: 100,
} as const;

// ── 필살기 ──────────────────────────────────────────────────────
export const SPECIAL = {
  IFRAMES: 120,           // 발동 프레임부터 [정본: 무적]
  HITSTOP: 10,
  IMMUNE_DMG: 10,         // 2막 면역 구조물엔 최하층 10대미지만
  MOON_DMG: 10,
} as const;

// ── 점수 [산술 검증: 1,500타 ≈ 7~9분에 9,999,999] ──────────────
export const SCORE = {
  BASE_HIT: 10,           // 타격 = 10 × min(combo, 999)
  FLOOR_BONUS: 500,
  DESTROY_BONUS: 2000,
  BOLT_BONUS: 1000,
  CANCEL_BONUS: 1000,
  BOSS_BONUS: 1_000_000,
  CAP: 99_999_999,        // [정본 카운터스톱]
  COMBO_CAP: 999,         // [정본]
  BUTTER_DESTROY_PER_LAYER: 1000,
  BUTTER_PERFECT: 50_000,
  GROUND_ROCK_COMBO: false, // 바닥 화산탄 파밍 콤보 (기본 off — 체크포인트 228 보존)
  CARRY_COMBO_TO_ACT2: true, // [정본: 콤보 유지 진입]
} as const;

// ── 2막 페이즈 테이블 [정본 수치 — checkpoints.test 가드] ───────
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
  ROCK_STACK_MAX: 3,                       // 레인당 적재 상한
  CHECKPOINTS: [40, 148, 168] as const,    // 이어하기 콤보 재설정 값
} as const;

// ── 달 보스 [정본: 50+100+80=230, 임계 50/150] ─────────────────
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
  CANNON: { COUNT: 3, AIM_GAP: 40, AIM_TELE: 30, SHOT_V: 700, SPARK_V: 300, SPARK_H: 24, HP: 2 },
  DEFEAT_SLOW: 0.2, DEFEAT_SLOW_S: 3,
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
  hit:            { hitstop: 2, shake: 1, flash: 2, particles: 5 },
  floorCollapse:  { hitstop: 3, shake: 3, flash: 2, particles: 10 },
  stackDestroy:   { hitstop: 6, shake: 6, flash: 0, particles: 24 },
  butterCollapse: { hitstop: 2, shake: 2, flash: 2, particles: 8 },
  special:        { hitstop: 10, shake: 10, flash: 2, particles: 24 },
  hurt:           { hitstop: 4, shake: 8, flash: 3, particles: 4 },
  guardBounce:    { hitstop: 1, shake: 2, flash: 2, particles: 3 },
  bossHit:        { hitstop: 2, shake: 1, flash: 2, particles: 4 },
  bossDefeat:     { hitstop: 30, shake: 12, flash: 4, particles: 64 },
};
export const JUICE_SYS = {
  SHAKE_MAX_AMP: 12,
  SHAKE_HALF_LIFE_F: 6,
  PARTICLE_POOL: 256,
  ONOMATOPOEIA_MAX: 3,    // 동시 의성어 팝업 상한
  PITCH_JITTER: 0.06,     // SFX 피치 ±6%
  PITCH_STEP_PER_10_COMBO: 1, // 반음
} as const;

// ── 진동 패턴 (podoal feedback.ts 차용) ─────────────────────────
export const HAPTIC = {
  hit: 8, floorCollapse: 20, stackDestroy: [30, 20, 30],
  butterCollapse: 10, special: [100, 50, 200], hurt: 60,
  guardBounce: 15, bossDefeat: [100, 50, 100, 50, 200],
  HIT_THROTTLE: 3,        // 연타 시 3회당 1회
} as const;

// ── 브랜드 팔레트 ───────────────────────────────────────────────
export const PALETTE = {
  BG: '#0D1330',
  RED: '#E5302E', YELLOW: '#FFD200', BLUE: '#1E62D0',
  WHITE: '#F4F1E8',
} as const;

// ── 저장 ────────────────────────────────────────────────────────
export const SAVE_KEY = 'gunbbu.v1';
