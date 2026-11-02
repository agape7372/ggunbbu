// 건뿌 — 코어 시뮬레이션 타입 정의.
// 이 파일은 전 모듈(코어/렌더/오디오/UI)과 서브에이전트 위임 계약의 근간이다.
// 제약: DOM 타입 사용 금지(순수 데이터). GameState는 완전 직렬화 가능해야 한다.

/**
 * 레인 1개. 배선(entity.lane 등)은 유지하되 값은 항상 0.
 * ★09-05 정정: 근거는 "원작에 좌우 이동이 없다"가 아니다 — 원작은 3레인 + 좌우 대시가 있다
 * (docs/ORIGINAL_BENCHMARK_2026-08-30.md §5-B). 단일 레인은 세로 360폭 모바일 조작성 선택이다
 * (사용자 확정, 불변 — 3레인 복원 제안·재질문 금지).
 */
export type Lane = 0;

/** 1막 챕터(스토리 해금) — 시각 스킨 전용, HP 규칙은 Material이 결정 */
export type Theme = 'europe' | 'asia' | 'eastasia' | 'modern';

export type Material =
  | 'weak' | 'mid' | 'hard'            // 1막 HP 1/2/3 (챕터 테마별 스킨)
  | 'butter'                           // 버터바 겹 HP1 (이벤트 스테이지 전용)
  | 'cathedral'                        // 2막 P1 HP5
  | 'lobby' | 'office' | 'penthouse'   // 2막 P2 마천루 HP 10/1/20
  | 'bell';                            // 작업 지시서 종탑의 종 — 안 베인다(깡). 가드로 되돌려 보낸다

export interface FloorSeg { hp: number; maxHp: number; }

export interface Floor {
  /** 단일 레인(M11) — 층당 세그 1개. HP 0이면 층 전체 붕괴 */
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
  /** 격파 연출 잔해 — 타격 시 콤보만, 착지 무해 [정본] */
  remnant?: boolean;
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
  /** 남은 격파 필요 타격 수 (초기 BOSS.HP=230) */
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

export type Mode = 'act1' | 'act2' | 'tokoton' | 'bonus' | 'stage';

/** 작업 지시서 난이도 — 0 견습 · 1 정규 · 2 외주 */
export type StageDiff = 0 | 1 | 2;

/** 현장 일지 한 판의 진행. 대본 자체는 id로 core/stages.ts에서 다시 찾는다(상태엔 위치만) */
export interface StageRun {
  id: string;
  diff: StageDiff;
  /** 다음에 낼 대본 걸음 */
  step: number;
  /** 다음 걸음 대기를 이미 걸었다 */
  armed: boolean;
  /** 건물 없는 걸음(번개 · 화산탄 · 쉼)의 대기 틱. 건물 걸음은 stackSpawnCd가 센다(▼ 예고) */
  wait: number;
  phase: 'script' | 'boss' | 'done';
  /** 지금 떨어지는 건물의 낙하 — 스폰 때 정해 stackPhysics가 읽는다(명물은 숨 · 무게로 바꾼다) */
  fallG: number;
  fallV: number;
  /** 베기 띄우기 배율(바람탑 들숨) — combat.tryHitStack이 읽는다 */
  liftMul: number;
  /** 지금 건물이 성급한가(대본 「~」) · 최하층이 HP1로 남은 틱 */
  hasty: boolean;
  hastyT: number;
  /** 끝난 틱(대본을 다 치운 틱 · 보스가 쓰러진 틱). 0 = 아직 */
  clearTick: number;
  tally: StageTally;
}

/** 도장 판정용 집계 — core/stage.ts가 이벤트와 개체 수 차이로 센다 */
export interface StageTally {
  /** 가드를 새로 누른 횟수 · 지난 틱에 누르고 있었나 */
  guardPress: number;
  guardHeld: boolean;
  jumps: number;
  specials: number;
  /** 콤보 끊김(comboBreak 이벤트) */
  breaks: number;
  lifeLost: number;
  hatBreak: number;
  /** 땅에 꽂힌 번개 · 땅에 닿은 화산탄 · 더미 최고 */
  strikes: number;
  landed: number;
  maxPile: number;
  /** 최근 60틱 안에 없앤 화산탄 틱 · 넷을 한 번에 없앤 적이 있나 */
  rockKills: number[];
  quad: boolean;
  /** 명물 셈 — 종을 벤 횟수 · 좌판 일곱 번 · 땅에 닿은 짐 */
  bellCuts: number;
  stall7: boolean;
  cargoDown: number;
  /** 2판 숨은 막 셈 — 좌판을 벤 수(장터) · 풍경 창에서 무너뜨린 층(아홉 번) · 13시 종을 받았나 · 장터가 나왔나 */
  stallCuts: number;
  chimeBreaks: number;
  bell13: boolean;
  market: boolean;
  /** 성급한 건물이 급락한 수(대본 `~`) */
  hastyDrops: number;
  /** 보스(명물 · 집행기) 마지막 한 타가 필살 */
  finishSpecial: boolean;
  /** 걸음(건물 · 보스)마다 치운 틱 */
  splits: number[];
  /** 지난 틱 끝의 살아 있는 화산탄 수 — 이번 틱 격파를 센다 */
  rocksSeen: number;
  /** 지난 틱 끝의 번개 수 · 땅에 선 채 벤 번개 */
  boltsSeen: number;
  boltGround: number;
}

/** 명물 보스 — 종탑 · 바람탑 · 구층탑 · 타워크레인 (core/landmark.ts) */
export type LandmarkId = 'bell' | 'wind' | 'pagoda' | 'crane';

export type LandmarkSt = 'enter' | 'play' | 'sit' | 'slam' | 'rise' | 'down';

export interface LandmarkState {
  id: LandmarkId;
  st: LandmarkSt;
  /** 지금 상태에 머문 틱 */
  t: number;
  /** 몸(종탑 · 바람탑 · 크레인 추). 구층탑은 몸이 s.stack이라 null. 층 = 체력 */
  body: { floors: Floor[]; y: number } | null;
  /** 파 번호 — 종탑 시각 칸 · 바람탑 노래 박 · 크레인 짐 번호 */
  wave: number;
  /** 이번 파에서 던진 수 · 구층탑 남은 층 · 크레인 짐 상태(0 아직 · 1 땅에 닿음 · 2 걸림) */
  n: number;
  /** 종탑 이번 파 점수(공중 가드 2점) · 바람탑 장터(1 = 나옴) · 구층탑 풍경 기와까지 남은 틱 · 크레인 내리는 중엔 케이블 벤 수, 놓은 뒤엔 오르는 중(1) */
  got: number;
  /** 던질 차례까지 남은 틱(예고) · 구층탑 풍경 창 남은 틱 · 크레인 걸기 연속(0 처음 · 2 반창 중 · 1 반창 뒤라 다음 걸림이 온창) */
  cue: number;
  /** 종탑 내려찍기 판정(0 아직 · 1 지남 · 2 막음) / 바람탑 0 들숨 · 1 날숨 / 구층탑 풍경 남은 틱 / 크레인 0 내리는 중 · 1 놓음 */
  air: number;
  /** 종탑 파 시작부터 센 틱(정각) · 바람탑 지금 좌판을 띄운 횟수(−1 = 젖음) · 구층탑 마지막으로 층이 깨진 틱 · 크레인 갈고리 띠 아래 끝 */
  k: number;
  /** 종탑 공중 가드로 올린 종 · 바람탑 역풍으로 가는 중 · 구층탑 지난 틱에 크게 떠오르던 중(띄움 판정) */
  flying: boolean;
  /** 2판 보조 셈 — 종탑 13시(0 없음 · 1 걸림 · 2 떨어지는 중) · 바람탑 맞바람 남은 틱 · 구층탑 이어 허문 층 수 · 크레인 버릇 셈(−2~2) */
  x: number;
}

/** 구역 작전 기믹. none = 아케이드 기본. 수치 테이블 MAT_HP 구조는 유지. */
export type GimmickId = 'none' | 'glass' | 'ice' | 'night' | 'orbit';

/** 장착 필살. 체크포인트 타격 수에 영향을 주면 안 된다. */
export type WazaId = 'tenchi' | 'ageba' | 'tetsu';

/**
 * 장착 무기. 대미지는 전부 1이다 — 2막 체크포인트가 층 HP 합(=타격 수)이라 대미지를 바꾸면
 * 산술이 깨진다. 무기는 사거리·띄우기·필살 게이지 배율만 바꾼다(config WEAPON).
 */
export type WeaponId = 'sword' | 'hammer' | 'crowbar' | 'grinder' | GreatswordId;

/** 대검 — 칼날 모양·색(render/sprites)과 세 칸(config WEAPON)만 다르다. 쥐는 자세는 하나 */
export type GreatswordId = 'iron' | 'saw' | 'hazard' | 'beam' | 'flame' | 'frost' | 'onyx' | 'gold';

/** 보급품. 상자는 고정 순서로 돈다(config SUPPLY.ROTATION) — 확률 없음. 안전모(hat)는 상자 밖, 콤보로 번다(HAT). */
export type ItemId = 'gloves' | 'coffee' | 'hat' | 'dust';

/** 타격감 이벤트 — core가 발행, 렌더/오디오/햅틱이 소비 (JUICE 매트릭스 키) */
export type JuiceKind =
  | 'hit' | 'floorCollapse' | 'stackDestroy' | 'butterCollapse'
  | 'special' | 'hurt' | 'guardBounce' | 'guardAirBounce' | 'bossHit' | 'bossDefeat'
  | 'boltCue' | 'boltStrike' | 'gaugeFull' | 'comboBreak'
  | 'chapterUnlock' | 'bonusEnter' | 'bonusPerfect' | 'phaseClear'
  | 'jump' | 'land' | 'headBonk' | 'guardDenied' | 'lifeLost' | 'slash'
  | 'supply' | 'hatBreak' | 'hatGet' | 'pinEscape';

export interface JuiceEvent {
  kind: JuiceKind;
  lane?: Lane;
  /** 발생 고도 (렌더 좌표 계산용) */
  y?: number;
  mat?: Material;
  combo?: number;
  /** 부가 수치 (완파 층수 등) */
  n?: number;
  /** supply: 상자에서 나온 것 */
  item?: ItemId;
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
  /**
   * 이번 판 최고 콤보. 결과화면·저장 기록이 읽는 값이다.
   * ★08-30 7차: 결과화면이 `combo`(현재 카운터)를 읽어 **항상 0**이었다 — 죽는 히트가
   * `hurtPlayer` 안에서 `breakCombo()` 를 먼저 부르고 그 다음에 over 플래그를 세우기 때문.
   */
  peakCombo: number;
  score: number;
  /** 방어 게이지 0~100 (원작 핑크 bougyobar) — 가드 전용. 0이면 가드 불가 */
  guardGauge: number;
  /** 기술 게이지 0~100 (원작 황색 wazabar) — 타격으로만 충전, 필살기 전용 */
  wazaGauge: number;
  /** 시작 장비 「필살 충전」 남은 수 — 게이지가 비면 하나 써서 가득 채운다. 평소엔 0 */
  wazaBank: number;
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
  /** 구역 작전 기믹 (아케이드는 none) */
  gimmick: GimmickId;
  /** 이번 주행 장착 필살 */
  waza: WazaId;
  /** 이번 주행 장착 무기 */
  weapon: WeaponId;
  /** 이번 판 1막·토코톤 완파 수 — 보급 상자 주기 */
  drops: number;
  /** 안전모를 쓰고 있다 — 다음 깔림 1회를 막는다. 2막에 들어가면 벗는다 */
  hat: boolean;
  /** 토코톤 버터바 사이클 진입 인덱스 — 히트스톱이 경계 틱을 삼켜도 소실 없게 (08-30 검증) */
  tokotonCycle: number;
  /** 작업 지시서 진행 (mode 'stage'일 때만) */
  stage: StageRun | null;
  /** 명물 보스 (작업 지시서 보스전일 때만) */
  lm: LandmarkState | null;
}

/** 프레임 입력 — input 레이어가 생성해 sim에 주입 */
export interface InputFrame {
  // ★08-30 5차: 점프는 **단발 엣지**다(원작 문법). 4차에 넣었던 jumpHold(가변 점프)는 사용자
  // 지시("한번 누르면 슝 솟아야하는데 왜 누르고있게만들었어?")로 철거했다. 홀드는 guard만.
  jump: boolean;    // 엣지
  guard: boolean;   // 홀드 (레벨)
  attack: boolean;  // 엣지
  special: boolean; // 엣지
}

export const EMPTY_INPUT: InputFrame = {
  jump: false, guard: false, attack: false, special: false,
};
