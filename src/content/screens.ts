// 타이틀 / 게임오버 / 결과 / 보너스 / 메뉴 — 플레이어가 읽는 화면 카피.

import { OPERATION, QUIP_STREAK_FROM } from '../config';
import { opNeed, opShort, type OpId } from '../meta/ops';
import { BOSS_NAME, HERO } from './world';
import type { Mode } from '../core/types';

/** 버티기 작전(값 = 버틴 초)인가, 건물 작전(값 = 부순 채 수)인가 */
const isSeconds = (id: OpId): boolean => OPERATION[id].metric === 'seconds';

export const SCREENS = {
  title: {
    buddha: '※ 2막부터 시작 (디버그)',
    best: '최고 점수',
    maxCombo: '최대 콤보',
    today: (done: number, total: number) => `오늘 ${done}/${total}`,
    dust: '먼지',
    orbit: '궤도조각',
  },

  /** 타이틀 메뉴 — 이름표 + 한 줄 보조(잠김이면 여는 조건) */
  menu: {
    arcade: '아케이드 시작',
    arcadeSub: '4구역 → 집행기',
    tokoton: '야근',
    tokotonSub: '끝없이 떨어진다',
    tokotonLocked: '2막을 깨면 열림',
    butter: '버터바 챌린지',
    butterSub: (round: number) => `${round}회차까지`,
    butterLocked: '판에서 만나면 열림',
    ops: '구역 작전',
  },

  tabs: {
    play: '플레이',
    missions: '미션',
    custom: '장비',
    shop: '상점',
    more: '설정',
  },

  /** 결과 카드. 엔딩 씬 짧은 표기. */
  result: {
    success: '작전 완료',
    petals: '민들레 홀씨가 흩날린다…',
    score: (n: number) => `점수 ${n.toLocaleString('ko-KR')}`,
    tokotonUnlock: '야근이 열렸다. 하늘은 아직 던진다.',
    fullComboNote: '풀콤보. 「기계가 더 못 셉니다.」 야근이 열렸다.',
  },

  gameover: {
    title: '철거 실패',
    /** 보고서 도장 — 신기록 판은 빨간 반려 대신 잉크 승인(빨강 = 실패·경고만) */
    stamp: '반려',
    stampBest: '승인',
    continue: '체크포인트에서 이어하기',
    revive: '광고 보고 일어나기',
    /** 웹(광고 미배선) — 광고를 위장하지 않는다 (08-30, P0-2) */
    reviveFree: '일어나기',
    reviveLeft: (n: number) => `${n}번 남음`,
    buildings: '벤 건물',
    buildingsUnit: (n: number) => `${n}채`,
    dust: '먼지',
    zone: '도달 구역',
    /** 다음 목표 한 줄 — 가장 싼 미보유 먼지 구매품 */
    nextGoal: (name: string, short: number) => (short > 0 ? `${name}까지 먼지 ${short}` : `${name} 살 먼지가 모였다`),
    nextTag: '다음 목표',
  },

  /** 이야기 판 진입 직전 도장 */
  stamps: {
    best: '신기록',
    perfect: 'PERFECT',
    act2: '2막',
    zone: (n: number) => `${n}구역`,
  },

  butter: {
    banner: '버터바 타임!',
    bannerHud: '버터바 타임!',
    short: '버터바',
    best: (n: number) => `최고 ${n.toLocaleString('ko-KR')}`,
    challengeEnd: '버터바 챌린지 끝!',
    rounds: ['1회차 · 얇은 겹', '2회차 · 세 겹', '3회차 · 100겹 타워'] as const,
  },

  tokoton: {
    name: '야근',
  },

  /** 특별작전 — 목표 한 줄 · 도장 · 결과 카드 (C3) */
  ops: {
    doneTitle: '작전 완료',
    timeUpTitle: '시간 종료',
    built: '벤 건물',
    held: '버틴 시간',
    bestStamp: '최고 도장',
    stampNew: '도장 갱신',
    noStamp: '도장 없음',
    retry: '한 판 더',
    list: '작전 목록',
    title: '타이틀로',
    /** 목표 한 줄 (B 도장 기준) */
    goal: (id: OpId): string => (isSeconds(id)
      ? `${OPERATION[id].grade.B}초 버티기`
      : `${OPERATION[id].limitSec}초 안에 건물 ${OPERATION[id].grade.B}채`),
    /** 도장 문턱 한 줄 */
    ladder: (id: OpId): string => {
      const g = OPERATION[id].grade;
      return `B ${g.B} · A ${g.A} · S ${g.S}`; // 단위는 목표 한 줄이 말한다
    },
    /** 판 도중 HUD 한 줄 — 남은 시간(건물 작전) · 다음 도장까지 */
    hud: (id: OpId, remainSec: number, value: number): string => {
      const next = opShort(id, value);
      const u = isSeconds(id) ? '초' : '채';
      const head = isSeconds(id) ? '' : `${remainSec}초 · `;
      return next ? `${head}${value}/${opNeed(id, next.next)}${u} ${next.next}` : `${head}${value}${u} S`;
    },
    /** 도장 없이 끝났을 때 결과 카드의 다음 목표 줄 */
    progress: (id: OpId, value: number): string => {
      const next = opShort(id, value);
      const u = isSeconds(id) ? '초' : '채';
      return next ? `${next.next} 도장까지 ${next.short}${u}` : '';
    },
  },

  /** 철거 자격 (C4) */
  license: {
    heading: '철거 자격',
    lead: '건물을 부순 만큼 자격이 열린다.',
    exam: '응시',
    progress: (have: number, need: number) => `건물 ${have.toLocaleString('ko-KR')}/${need.toLocaleString('ko-KR')}채`,
    needBuildings: (n: number) => `건물 ${n.toLocaleString('ko-KR')}채 더`,
    maxTitle: '1급. 필기는 여전히 미응시',
    maxTag: '합격',
    passed: (t: string) => `${t} 합격`,
    report: '철거 보고서',
  },

  /** 첫 목숨 손실 때 한 번 — 가드 가르치기 (C1) */
  teach: {
    guard: '가드로 건물을 튕겨 올려라',
    guardSub: '건물이 닿는 순간에 누른다',
  },
} as const;

/** 게임오버 만담. 톤 = 건조한 전단지. 점수·틱으로 고르면 된다. */
export const GAMEOVER_QUIPS: readonly string[] = [
  '건물주가 고소장을 보냈습니다',
  '철거 자격증 정지 3개월',
  '보험: 천재지변 해당 없음',
  '오늘 알바는 여기까지입니다',
  '깔린 채로 퇴근 도장을 찍었습니다',
  `${HERO} 머리가 납작해졌습니다`,
  `${BOSS_NAME}가 평가를 남겼습니다: 「못생김.」`,
  '현장 실습은 학점으로 안 쳐 줍니다',
  '하늘이 한 채 더 던졌습니다',
  '견습은 산재 처리 대상이 아닙니다',
  '허가 없이 깔렸습니다',
  '무단 철거 신고가 들어왔습니다',
  '파괴자 측 변호인이 이겼습니다',
  '남은 지구가 퇴근을 막았습니다',
];

// ── 조건 표 (C10) ────────────────────────────────────────────
// 반응은 코드 분기가 아니라 데이터다. QUIP_RULES 는 구체적인 것부터 — 처음 맞는 규칙이 이긴다.
// 직전 줄은 다시 안 쓴다. 연속 사망 사다리는 끝 칸에서 닫히고 첫 칸으로 돌아가지 않는다.
export interface QuipCtx {
  score: number;
  /** 이번 판에 안전모가 깨졌나 */
  hatBroke: boolean;
  chapter: number;
  mode: Mode;
  /** 집행기 앞에서 죽었나 */
  boss: boolean;
  /** 같은 세션 연속 사망 횟수 (이번 판 포함) */
  streak: number;
  /** 줄 고르기 시드 — 점수 + 틱 */
  seed: number;
}

export interface QuipRule {
  id: string;
  when(c: QuipCtx): boolean;
  lines: readonly string[];
}

/** 연속 사망 사다리 — 뒤 칸일수록 짧다 */
export const QUIP_LADDER: readonly string[] = [
  '세 번째입니다. 서류가 쌓입니다',
  '물 한 잔 하고 오세요',
  '오늘은 여기까지',
];

export const QUIP_RULES: readonly QuipRule[] = [
  {
    id: 'boss',
    when: (c) => c.boss,
    lines: [
      `${BOSS_NAME}가 퇴근을 허락하지 않았습니다`,
      `${BOSS_NAME} 앞에서 서류가 반려됐습니다`,
      '집게가 한 번 더 집었습니다',
    ],
  },
  {
    id: 'zero',
    when: (c) => c.score <= 0,
    lines: [
      '한 대도 안 쳤습니다. 착수금은 환불 불가',
      '칼은 뽑았습니다. 휘두르진 않았습니다',
      '출근만 했습니다. 철거는 내일입니다',
    ],
  },
  {
    id: 'hat',
    when: (c) => c.hatBroke,
    lines: [
      '안전모는 제 몫을 했습니다. 딱 한 번',
      '안전모가 깨졌습니다. 이번 달 지급분입니다',
      '모자는 대신 죽었습니다',
    ],
  },
  {
    id: 'tokoton',
    when: (c) => c.mode === 'tokoton',
    lines: ['야근 수당은 없습니다', '야근 중 사망은 산재가 아닙니다', '하늘은 밤새 던집니다'],
  },
  {
    id: 'act2',
    when: (c) => c.mode === 'act2',
    lines: ['하늘에서 집게가 내려왔습니다', '최종 국면은 신입을 안 봐줍니다', '서류에 없던 구간입니다'],
  },
  {
    id: 'deep',
    when: (c) => c.mode === 'act1' && c.chapter >= 2,
    lines: ['여기까지 온 것이 용합니다', '높은 구역은 보험이 안 됩니다', '구역이 높을수록 서류가 많습니다'],
  },
];

/**
 * 게임오버 만담 한 줄. 사다리(연속 사망) → 구체적인 규칙 → 기본 14줄 순.
 * `last`(직전에 보인 줄)와 같은 줄은 건너뛴다 — 같은 규칙에서 다른 줄을, 줄이 없으면 다음 규칙으로.
 */
export function pickQuip(c: QuipCtx, last: string): string {
  if (c.streak >= QUIP_STREAK_FROM) {
    const rung = QUIP_LADDER[Math.min(c.streak - QUIP_STREAK_FROM, QUIP_LADDER.length - 1)]!;
    if (rung !== last) return rung;
  }
  const from = (lines: readonly string[]): string | null => {
    const n = lines.length;
    for (let k = 0; k < n; k++) {
      const line = lines[(Math.abs(c.seed | 0) + k) % n]!;
      if (line !== last) return line;
    }
    return null;
  };
  for (const r of QUIP_RULES) {
    if (r.when(c)) {
      const line = from(r.lines);
      if (line) return line;
    }
  }
  return from(GAMEOVER_QUIPS) ?? GAMEOVER_QUIPS[0]!;
}

export function butterChallengeEnd(score: number): readonly string[] {
  return [SCREENS.butter.challengeEnd, SCREENS.result.score(score)];
}

export function butterEnterLines(chapterLines: readonly string[]): readonly string[] {
  return [...chapterLines, '', SCREENS.butter.banner];
}
