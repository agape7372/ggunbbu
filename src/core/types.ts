// 건뿌 — 코어 시뮬레이션 타입 정의.
// 이 파일은 전 모듈(코어/렌더/오디오/UI)과 서브에이전트 위임 계약의 근간이다.
// 제약: DOM 타입 사용 금지(순수 데이터). GameState는 완전 직렬화 가능해야 한다.

/** 원작에 좌우 이동이 없다 → 레인 1개. 배선(entity.lane 등)은 유지하되 값은 항상 0. */
export type Lane = 0;

/** 1막 챕터(스토리 해금) — 시각 스킨 전용, HP 규칙은 Material이 결정 */
export type Theme = 'europe' | 'asia' | 'eastasia' | 'modern';

export type Material =
  | 'weak' | 'mid' | 'hard'            // 1막 HP 1/2/3 (챕터 테마별 스킨)
  | 'butter'                           // 버터바 겹 HP1 (이벤트 스테이지 전용)
  | 'cathedral'                        // 2막 P1 HP5
  | 'lobby' | 'office' | 'penthouse';  // 2막 P2 마천루 HP 10/1/20

export interface FloorSeg { hp: number; maxHp: number; }

export interface Floor {
  /** 레인 0/1/2 독립 HP. 마천루(tower)는 층 공유 HP 특례 — sharedHp 사용 */
  segs: [FloorSeg];
  mat: Material;
  /** 층 높이 px (기본 FLOOR_H) */
  h: number;
}

export type StackVariant = 'building' | 'butterbar' | 'cathedral' | 'skyscraper';

export interface DebrisPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  life: number;
}

export interface FallingStack {
  kind: 'stack';
  variant: StackVariant;
  theme: Theme;
  /** index 0 = 최하층 */
  floors: Floor[];
  /** 최하층 바닥면의 지면 대비 고도 px (지면=0, 위가 +) */
  y: number;
  /** 수직 속도 px/s (+위) */
  vy: number;
  /** 필살기 전파괴 면역 (2막 구조물) */
  specialImmune: boolean;
  /** 층 공유 HP 특례 (마천루: 레인 무관 타격) */
  sharedHp: boolean;
  /** 접지 후 정지 상태 (깔림) */
  resting: boolean;
  /** 스폰 시 총 층수 (완파 보너스 계산용) */
  totalFloors: number;
}

export interface Bolt {
  kind: 'bolt';
  lane: Lane;
  y: number;
  vy: number;
  /** 발사 전 예고 카운트다운 (틱). >0이면 아직 낙하 전(큐 표시 구간) */
  cueTicks: number;
}

export interface Rock {
  kind: 'rock';
  lane: Lane;
  y: number;
  vy: number;
  hp: number;
}

export interface Shot {
  kind: 'shot';
  lane: Lane;
  x: number;
  y: number;
  vx: number;
  vy: number;
  guardable: boolean;
  /** 공격으로 상쇄 가능 여부 (드론탄 true / 대포탄·스파크 false) */
  cancellable: boolean;
}

export interface Rabbit {
  kind: 'rabbit';
  /** 진입 측 화면 x */
  x: number;
  y: number;
  side: -1 | 1;
  hp: number;
  /** 발사까지 남은 틱 */
  fireTicks: number;
  /** 퇴장까지 남은 틱 (발사 후) */
  leaveTicks: number;
}

export interface Cannon {
  kind: 'cannon';
  lane: Lane;
  /** 설치 x — 단일 레인이라 대포는 좌/중/우로 벌려 설치된다 (가운데 것이 플레이어 직격) */
  x: number;
  hp: number;
  /** 다음 발사까지 틱 */
  fireTicks: number;
}

export type Entity = FallingStack | Bolt | Rock | Shot | Rabbit | Cannon;

export type PlayerPose =
  | 'idle' | 'jump' | 'guardG' | 'guardA' | 'guardBreak'
  | 'attack' | 'special' | 'pinned' | 'dead';

export interface PlayerState {
  lane: Lane;
  /** 발 높이 (지면=0) */
  y: number;
  vy: number;
  pose: PlayerPose;
  /** 현재 pose 진행 틱 (0=시작). guard 선딜/attack 프레임/스턴 카운트에 사용 */
  poseTick: number;
  invulnTicks: number;
  /** 공격 입력 버퍼 남은 틱 */
  bufAttack: number;
  bufJump: number;
  bufGuard: number;
  /** 깔림 반복 라이프 손실 타이머 */
  pinTick: number;
  /** 이번 attack 판정 묶음에서 이미 명중했는가 (묶음당 1히트) */
  attackHit: boolean;
  /** attack 종료 후 복귀할 상태가 공중인가 */
  attackFromAir: boolean;
}

export type Act2Phase = 'cathedral' | 'tower' | 'bolt' | 'rock' | 'moon';

export type BossPattern =
  | 'charge' | 'pbCharge' | 'multiCharge'
  | 'riseBolt5' | 'riseBolt9' | 'rabbits' | 'cannons';

export type BossSt =
  | 'enter' | 'idle' | 'telegraph' | 'descend' | 'charging'
  | 'rising' | 'attacking' | 'stagger' | 'roar' | 'defeated';

export interface BossState {
  /** 남은 격파 필요 타격 수 (초기 MOON_HP=230) */
  hp: number;
  /** 누적 대미지 (티어 판정용) */
  dmg: number;
  tier: 0 | 1 | 2;
  st: BossSt;
  stTick: number;
  pattern: BossPattern | null;
  /** 마지막 사용 패턴 (연속 금지) */
  lastPattern: BossPattern | null;
  /** 패턴 내부 진행 카운터 (돌진 반복 수, 번개 발사 수 등) */
  step: number;
  /** 보스 표시 고도 */
  y: number;
  /** 돌진 조준 레인 */
  targetLane: Lane;
  hittable: boolean;
}

export type Mode = 'act1' | 'act2' | 'tokoton' | 'bonus';

/** 타격감 이벤트 — core가 발행, 렌더/오디오/햅틱이 소비 (JUICE 매트릭스 키) */
export type JuiceKind =
  | 'hit' | 'floorCollapse' | 'stackDestroy' | 'butterCollapse'
  | 'special' | 'hurt' | 'guardBounce' | 'guardAirBounce' | 'bossHit' | 'bossDefeat'
  | 'boltCue' | 'boltStrike' | 'gaugeFull' | 'comboBreak'
  | 'chapterUnlock' | 'bonusEnter' | 'bonusPerfect' | 'phaseClear'
  | 'jump' | 'land' | 'guardDenied' | 'lifeLost';

export interface JuiceEvent {
  kind: JuiceKind;
  lane?: Lane;
  /** 발생 고도 (렌더 좌표 계산용) */
  y?: number;
  mat?: Material;
  combo?: number;
  /** 부가 수치 (완파 층수 등) */
  n?: number;
}

export interface PhaseCounters {
  boltsSpawned: number;
  rocksSpawned: number;
  /** 페이즈 경과 틱 (화산탄 타임박스 등) */
  phaseTick: number;
  /** 다음 스폰까지 틱 */
  spawnCd: number;
}

export interface BonusState {
  /** 이벤트 회차 1~3 (토코톤 4+ = 100겹 반복) */
  round: number;
  /** 남은 틱 (30s = 1800) */
  ticksLeft: number;
  /** 이번 라운드 남은 스폰 큐 (겹수 배열) */
  queue: number[];
  /** 파괴한 버터바 수 / 총 수 (PERFECT 판정) */
  destroyed: number;
  total: number;
  perfect: boolean;
  /** 종료 후 복귀 모드 (act1 본편 / tokoton) */
  returnMode: 'act1' | 'tokoton';
}

export interface GameState {
  tick: number;
  rngState: number;
  mode: Mode;
  act2Phase: Act2Phase | null;
  /** 1막 진행 챕터 index 0~3 */
  chapter: number;
  player: PlayerState;
  /** 현재 낙하 스택 (1막/2막 P1·P2/버터바) */
  stack: FallingStack | null;
  /** 다음 스택 스폰까지 틱 */
  stackSpawnCd: number;
  entities: Entity[];
  /** 층 붕괴 후 남아 떨어지는 박스 */
  debris: DebrisPiece[];
  /** 레인별 바닥 적재 화산탄 수 */
  groundRocks: number;
  boss: BossState | null;
  bonus: BonusState | null;
  /** 2막 페이즈 진행 카운터 (act2.ts 전용) */
  act2c: { spawned: boolean; bolts: number; rocks: number; cd: number; t: number } | null;
  combo: number;
  score: number;
  /** 방어 게이지 0~100 (원작 핑크 bougyobar) — 가드 전용. 0이면 가드 불가 */
  guardGauge: number;
  /** 기술 게이지 0~100 (원작 황색 wazabar) — 타격으로만 충전, 필살기 전용 */
  wazaGauge: number;
  /** 방어 게이지 회복 대기 틱 (가드 사용 직후 잠시 회복 정지) */
  guardRegenCd: number;
  lives: number;
  /** 히트스톱 남은 틱 (sim 스킵, 버퍼는 수집) */
  hitstop: number;
  /** 1막 진행도 0~1 (토코톤 0~2) */
  p: number;
  /** 2막 이어하기 체크포인트 (0=없음/40/148/168) */
  checkpoint: number;
  /** 2막 풀콤보 플래그 (99,999,999 엔딩 판정) */
  fullCombo: boolean;
  /** 이번 프레임 발행 이벤트 — 소비 측이 클리어 */
  events: JuiceEvent[];
  /** 게임 종료 플래그 */
  over: 'gameover' | 'cleared' | null;
}

/** 프레임 입력 — input 레이어가 생성해 sim에 주입 */
export interface InputFrame {
  jump: boolean;    // 엣지
  guard: boolean;   // 홀드 (레벨)
  attack: boolean;  // 엣지
  special: boolean; // 엣지
}

export const EMPTY_INPUT: InputFrame = {
  jump: false, guard: false, attack: false, special: false,
};
