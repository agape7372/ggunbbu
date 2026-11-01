// 작업 지시서 글 — 판 이름 · 지시서 세 줄 · 수수께끼 · 퇴장 대사 · 보고서 문구. 규칙 · 수치는 core/stages.ts.
// 톤: 짧은 평서문. 아무도 칭찬받지 않는다. 담당자는 끝까지 안 나온다(docs/STAGES_2026-10-31.md §10).
// 화면에 보이는 말은 이 파일 한 곳에서 고친다.

import { STAGES } from '../core/stages';

export const STAGE_MODE = {
  title: '작업 지시서',
  /** 모드 표지 — 처음 열 때 한 번 */
  cover: ['지시서는 왔다.', '서명은 없다.', '뿌뿌는 간다.'],
  list: '지시서 목록',
  log: '현장 일지',
  report: '철거 보고서',
  diffs: ['견습', '정규', '외주'],
  diffNote: ['기록 안 남음', '기록 남음', '안전모 없음'],
  diffLocked: '정규를 깨면 열린다',
  stamps: ['접수', '이상 없음', '기한 내', '특기 사항', '전임자 확인'],
  reject: '반려',
  /** 도장이 찍힌 자리의 인장 글자 */
  stampedMark: '필',
  start: '착수',
  resubmit: '재제출',
  next: '다음 지시서',
  practice: '보스 연습',
  practiceNote: '보스부터 · 기록 없음',
  locked: '앞 지시서를 끝내면 열린다',
  par: '기한',
  master: '전임자',
  myBest: '내 기록',
  none: '없음',
  /** 전임자 도장을 처음 찍은 날 */
  masterBeat: ['전임자보다 빨랐다.', '전임자는 어디 갔는지 모른다.'],
  /** 정규로 처음 깬 판 */
  firstClear: '첫 철거',
  newBest: '새 기록',
  /** 자연층 — 종을 세 번 「깡」 치면 한 번 */
  bellHint: '안 베인다. 다른 손을 쓰라.',
  windHint: '날숨엔 땅에서 막는다.',
  craneHint: '부서진 짐은 안 올라간다.',
  /** 2판 기믹 자막 — 막힌 흔적이 보일 때만(ui/stageLogic.ts) */
  bellAct3Hint: '이제 종이 망치다.',
  windAct3Hint: '들숨엔 몸이 뜬다.',
  pagodaPullHint: '더미가 탑을 당긴다.',
  craneDoubleHint: '한 번 더 걸어라.',
  /** 보스 지시서 밑 한 줄의 머리말 */
  note: '참고',
  /** 보스가 있는 판 — 목록 카드 인장. 판 위 진행 막대 끝엔 보스 이름, 보스 없는 판은 barEnd */
  bossTag: '보스',
  barEnd: '끝',
  /** 진행 막대 머리 「남은 5」 · 아케이드 1막 막대 끝 인장(그 뒤 2막 끝에 집행기) */
  barLeft: '남은',
  barAct2: '2막',
  /** 화면 이름표 — ui/stageView.ts */
  home: '홈',
  back: '목록',
  navStamp: '서명 없음',
  clears: '철거',
  stampTotal: '정규 도장',
  progress: '걸음',
  tie: '동률',
  ahead: '앞',
  again: '다시',
  prevBest: '전 기록',
  practiceReport: '연습 · 기록 없음',
  cleared: '철거 완료',
  notCleared: '미완료',
  inkSeal: '외주',
} as const;

export interface RegionText {
  name: string;
  /** 지역 첫 지시서 세 줄 */
  start: readonly [string, string, string];
  /** 명물 앞 지시서 세 줄 */
  boss: readonly [string, string, string];
  /** 명물을 깬 뒤 목록에 남는 세 줄(세계가 바뀐 걸 목록이 비춘다) */
  after: readonly [string, string, string];
}

export const REGIONS: readonly RegionText[] = [
  {
    name: '서쪽 회랑',
    start: ['서쪽 회랑.', '종은 정각마다 울렸다.', '아무도 시간을 안 봤다.'],
    boss: ['종탑은 철거 보류 3년.', '사유: 시계가 맞음.', '뿌뿌는 시계를 안 본다.'],
    after: ['종이 열두 번 울렸다.', '하나는 땅에서 울렸다.', '정각이었다. 아마.'],
  },
  {
    name: '강턱 시장',
    start: ['강턱 시장.', '바람이 값을 매겼다.', '깃발은 전부 바람 편이다.'],
    boss: ['바람탑 철거 보류.', '사유: 담당자 날려감.', '돌아온 기록은 없다.'],
    after: ['바람이 멎었다.', '좌판 값이 내렸다.', '바람값이 빠졌다.'],
  },
  {
    name: '기와능선',
    start: ['기와능선.', '기와는 비를 막는다.', '비는 안 왔다.'],
    boss: ['구층탑, 문화재 지정 대기.', '대기 번호 9.', '앞에 아무도 없다.'],
    after: ['탑은 아홉 층이었다.', '기와는 안 셌다.', '세는 건 감독관 일이다.'],
  },
  {
    name: '철근 해안',
    start: ['철근 해안.', '바다는 매립됐다.', '철근만 파도로 남았다.'],
    boss: ['크레인이 짐을 내렸다.', '받는 사람 없음.', '반송 담당: 뿌뿌.'],
    after: ['짐은 다 돌려보냈다.', '수령인 불명.', '크레인이 먼저 퇴근했다.'],
  },
  {
    name: '본사',
    start: ['본사는 하늘에 있다.', '접견실은 지상에 없다.', '뿌뿌는 1층에서 기다린다.'],
    boss: ['집행기는 지시대로 했다.', '지시는 「전부」였다.', '서명란은 비어 있다.'],
    after: ['집행기가 멈췄다.', '지시서는 더 안 온다.', '서명은 끝내 없었다.'],
  },
];

export interface StageText {
  name: string;
  order: readonly [string, string, string];
  /** 특기 사항 자리 밑에 늘 보이는 한 줄 */
  riddle: string;
  /** 보스판 지시서 밑 「참고」 한 줄(2판 기믹 암시) */
  note?: string;
}

const R = REGIONS;

export const STAGE_TEXT: Readonly<Record<string, StageText>> = {
  '1-1': { name: '회랑 3번지', order: R[0].start, riddle: '막지 않아도 되는 날이 있다.' },
  '1-2': { name: '회랑 끝 집', order: ['회랑 끝 집.', '돌벽은 세 번 쳐야 무너진다.', '급한 집이 하나 섞였다.'], riddle: '끊지 말고 띄워라.' },
  '1-B': { name: '종탑', order: R[0].boss, riddle: '종은 베는 게 아니다.', note: '시계는 열두 번 친다. 보통은.' },
  '2-1': { name: '강턱 장터', order: R[1].start, riddle: '발은 땅에.' },
  '2-2': { name: '강턱 밤장', order: ['밤장이 선다.', '좌판이 서둘러 내려온다.', '급한 건 먼저 무너진다.'], riddle: '기다리면 떨어진다.' },
  '2-B': { name: '바람탑', order: R[1].boss, riddle: '좌판 하나를 일곱 번. 땅은 모른다.', note: '좌판은 상인 것이다.' },
  '3-1': { name: '능선 첫 지붕', order: R[2].start, riddle: '쌓아도 된다.' },
  '3-2': { name: '능선 마루', order: ['능선 마루.', '기와와 집이 같이 온다.', '받을 손은 하나다.'], riddle: '넷은 한 박이다.' },
  '3-B': { name: '구층탑', order: R[2].boss, riddle: '지붕은 땅을 모른다.', note: '아홉 층, 풍경 아홉 번.' },
  '4-1': { name: '해안 1부두', order: R[3].start, riddle: '철근은 하늘에서 받는다.' },
  '4-2': { name: '매립지 끝', order: ['매립지 끝.', '철근, 기와, 급한 집.', '전부 오늘 마감이다.'], riddle: '손으로만.' },
  '4-B': { name: '타워크레인', order: R[3].boss, riddle: '짐은 땅에 내려놓지 않는다.', note: '줄은 짐보다 약하다.' },
  HQ: { name: '본사', order: R[4].start, riddle: '마지막 한 수는 아껴 둔 것.' },
};

/** 보스판 퇴장 대사 — 2판 기믹 > 특기 사항 > 필살 마무리 > 베기 마무리 순으로 하나 */
const OUTROS: Readonly<Record<string, { cut: readonly string[]; special?: readonly string[]; secret: readonly string[]; extra?: readonly string[] }>> = {
  '1-B': { cut: ['종탑은 시간을 알렸다.', '이제 아무도 안 늦는다.'], special: ['종이 한 번에 울렸다.', '정각은 아니었다.'], secret: ['종은 끝까지 종이었다.'], extra: ['13시였다.'] },
  '2-B': { cut: ['바람이 멎었다.', '값은 그대로다.'], special: ['탑이 한 숨에 갔다.', '날숨이었다.'], secret: ['좌판은 끝내 땅을 안 봤다.'], extra: ['좌판은 상인 것이었다.'] },
  '3-B': { cut: ['탑은 아홉 층이었다.', '지금은 터다.'], special: ['탑이 한 층이 됐다.', '심사는 다음 달이다.'], secret: ['기와는 한 장도 안 깨졌다.', '탑만 없다.'], extra: ['풍경이 아홉 번 울렸다.'] },
  '4-B': { cut: ['짐은 전부 돌려보냈다.', '수령인 불명.'], special: ['짐이 한 번에 올라갔다.', '영수증은 없다.'], secret: ['짐은 한 번도 땅을 안 밟았다.', '받은 사람도 없다.'] },
  // 본사 특기 사항이 곧 필살 마무리라 필살 줄을 따로 두지 않는다
  HQ: { cut: ['집행기가 멈췄다.', '지시는 「전부」였다.'], secret: ['마지막 한 수는 아껴 둔 것이었다.', '집행기는 끝까지 몰랐다.'] },
};

export function stageOutro(id: string, o: { secret: boolean; finishSpecial: boolean; extra?: boolean }): readonly string[] {
  const t = OUTROS[id];
  if (!t) return [];
  if (o.extra && t.extra) return t.extra;
  if (o.secret) return t.secret;
  if (o.finishSpecial && t.special) return t.special;
  return t.cut;
}

/** 판 id → 지역 글 */
export function regionOf(id: string): RegionText {
  const d = STAGES.find((x) => x.id === id);
  return REGIONS[d?.region ?? 0];
}

/** 틱 → 「1:23.45」 */
export function fmtStageTime(ticks: number): string {
  const cs = Math.round((ticks * 100) / 60);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** 틱 차이 → 「1.8」(초, 소수 한 자리). 0.05초 미만은 두 자리 — 「0.0초 늦음」이 안 나게 */
export function fmtGap(ticks: number): string {
  const v = Math.max(0, ticks) / 60;
  return v > 0 && v < 0.05 ? v.toFixed(2) : v.toFixed(1);
}

/** 반려 사유 한 줄. 특기 사항은 사유 대신 수수께끼가 늘 보이므로 여기 없다 */
export const REJECT = {
  done: '사유: 미완료.',
  safe: (lifeLost: number) => (lifeLost > 0 ? `사유: 목숨 ${lifeLost}.` : '사유: 안전모.'),
  inTime: (lateTicks: number) => `사유: ${fmtGap(lateTicks)}초 늦음.`,
  master: (gapTicks: number, chae: number) => (chae > 0 ? `사유: ${fmtGap(gapTicks)}초. 미처리 ${chae}건.` : `사유: ${fmtGap(gapTicks)}초.`),
} as const;
