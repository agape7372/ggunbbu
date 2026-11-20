// 평소 몸 연기 — 대기 · 점프 · 베기 · 가드도 필살처럼 키 자세 시간표로 그린다(11-14 사용자 「이대로 모션 총 대개편」).
// 필살 몸 연기(wazaBody.ts)와 같은 문법 · 같은 그리기(drawLiveBody)다. core는 읽기만 한다.
// 자세가 바뀌면 직전에 그린 몸에서 새 자세로 몇 틱에 걸쳐 잇는다. 베기 · 가드 깨짐은 잇지 않고 바로 선다(한 틱에 풀려야 세다).
// 무기마다 서기 · 베기가 다르다(사용자 「무기의 크기나 특성 고려해서 각각 다른모션」) — 아래 STYLE.

import { PLAYER } from '../config';
import type { GameState, PlayerPose, WeaponId } from '../core/types';
import { GREAT_L, SWORD_L, greatLook, type Body } from './sprites';
import { STAND, STAND_GREAT, mix, out, play, pose, sink, type Kit } from './wazaBody';

const PI = Math.PI;
type Pt = readonly [number, number];
type Opt = Parameters<typeof pose>[7];
const hold = (): number => 0; // 다음 키까지 앞 자세로 버틴다 — 한 틱에 넘어간다
/** 두 손으로 쥔 자세 */
const two = (head: Pt, hip: Pt, fF: Pt, fB: Pt, aF: number, sa: number, o: Opt = {}): Body => pose(head, hip, fF, fB, aF, 'grip', sa, o);

/** 한 번 휘두름 — 쳐듦 · 닿음(칼이 머리 위 건물 밑면에 닿는 순간) · 지나감 */
interface Swing {
  wind: Body;
  hit: Body;
  follow: Body;
}

/** 무기 하나의 몸짓 — 서기 + 휘두름(a) + 연타 때 번갈아 나오는 되돌아오는 휘두름(b) + 일어서는 틱 수. buzz = 닿아 있는 동안 떤다 */
interface Style {
  stand: Body;
  a: Swing;
  b?: Swing;
  rec: number;
  buzz?: boolean;
  /** 필살 몸에 입히는 특성 — 길이 배수 · 무게 · 한 손(wazaBody의 Kit) */
  long?: number;
  heft?: number;
  oneHand?: boolean;
}

// 건물은 머리 위에서 떨어진다(판정 = 발 위 세로 범위 attackRange). 그래서 모든 무기가 「닿음」에서 칼이 머리 위에 있다.
// 무기마다 다른 것은 거기까지 가는 길 · 닿은 몸 · 지나간 뒤다. 길은 위쪽 공격의 여섯 갈래에서 골랐다(대전 액션의 위 강공격 프레임을 보고 옮김):
//   넘겨 베기(앞 바닥 → 머리 위 → 뒤, 연타는 되돌아온다) · 곧추 뻗기 · 받쳐 갈기 · 올려 치기(뜀) · 걸어 당기기 · 돌며 베기.
// 칼 각은 숫자 그대로 잇는다 — 앞 아래 +0.5 → 위 −π/2 → 뒤 아래 −π−0.5. 뒤를 +π 쪽으로 적으면 칼이 땅을 지나 돈다.
const UP = -PI / 2;
const BACK = -PI;
const WIDE_F: Pt = [11, 0];
const WIDE_B: Pt = [-13, 0];

const STYLE: Record<WeaponId, Style> = {
  // 철거칼 — 가볍다. 한 손으로 머리 위를 빠르게 넘긴다. 뒤에서 앞으로, 연타는 앞에서 뒤로 되돌아온다. 빈손이 반대로 뻗어 균형을 잡는다
  sword: {
    stand: STAND,
    a: {
      wind: pose([-2, -44], [0, -19.5], WIDE_F, WIDE_B, -2.3, 0.2, BACK + 0.45, { lF: 15, sl: 1.1, eF: -3, eB: 2 }),
      hit: pose([6, -45], [1, -19], [12, 0], [-13, 0], -1.25, 2.5, UP + 0.15, { lF: 16, sl: 1.2 }),
      follow: pose([10, -37], [-1, -16], [12, 0], [-17, 0], -0.35, PI - 0.5, -0.1, { sl: 1.15, eB: 1.5 }),
    },
    b: {
      wind: pose([9, -38], [-1, -16.5], [12, 0], [-16, 0], 0.1, PI - 0.4, 0.2, { sl: 1.1 }),
      hit: pose([-3, -46.5], [1, -20], [11, 0], [-12, 0], -1.9, 0.5, UP - 0.3, { lF: 16, sl: 1.2 }),
      follow: pose([-4, -43], [0, -19], [10, 0], [-12, 0], -2.5, 0.1, BACK + 0.25, { lF: 15, sl: 1.1, eF: -2 }),
    },
    rec: 9,
  },
  // 오함마 — 무겁고 짧다. 앞 바닥에 늘어뜨렸다가 온몸으로 뛰며 머리 위로 넘겨 뒤 바닥에 떨군다. 연타는 뒤에서 앞으로 되넘긴다. 일어서는 데 오래 걸린다
  hammer: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 1.0, 1.3, { sl: 1.1 }),
    a: {
      wind: two([6, -33], [-3, -12], [10, 0], [-11, 0], 1.0, 0.6, { sl: 1.15 }),
      hit: two([-3, -50], [2, -25], [9, -8], [-5, -7], UP - 0.15, UP - 0.25, { lF: 16, sl: 1.2 }),
      follow: two([-6, -35], [2, -13], [11, 0], [-11, 0], 2.3, BACK - 0.55, { sl: 1.15 }),
    },
    b: {
      wind: two([-6, -34], [2, -12.5], [11, 0], [-11, 0], 2.35, BACK - 0.6, { sl: 1.15 }),
      hit: two([3, -50], [-1, -25], [7, -7], [-7, -8], UP + 0.15, UP + 0.25, { lF: 16, sl: 1.2 }),
      follow: two([7, -33], [-3, -12], [10, 0], [-11, 0], 0.95, 0.55, { sl: 1.15 }),
    },
    rec: 16,
    long: 1.05,
    heft: 2.5,
  },
  // 빠루 — 길다. 웅크려 곧게 세웠다가 앞 무릎을 굽혀 들어가며 곧추 뻗어 걸고, 주저앉으며 몸 쪽으로 당겨 뜯는다
  crowbar: {
    stand: { ...STAND, sa: -1.45, sl: 1.3 },
    a: {
      wind: two([2, -36], [-3, -13.5], [10, 0], [-11, 0], 1.15, UP + 0.12, { lF: 11, sl: 1.3 }),
      hit: two([4, -47.5], [2, -20], [10, 0], [-13, 0], UP + 0.05, UP + 0.03, { lF: 16, sl: 1.4, eF: 2 }),
      follow: two([3, -38], [-2, -15], [10, 0], [-10, 0], -0.35, UP + 0.28, { lF: 9, sl: 1.3 }),
    },
    b: {
      wind: two([1, -36], [-2, -13.5], [10, 0], [-11, 0], 1.3, UP - 0.15, { lF: 11, sl: 1.3 }),
      hit: two([1, -47.5], [-1, -20], [12, 0], [-10, 0], UP - 0.12, UP - 0.12, { lF: 16, sl: 1.4, eF: 2 }),
      follow: two([-2, -39], [0, -15.5], [10, 0], [-10, 0], -0.9, UP - 0.35, { lF: 9, sl: 1.3 }),
    },
    rec: 9,
    long: 1.24,
  },
  // 그라인더 — 짧다. 다리를 벌려 버티고 두 손으로 머리 위에 받쳐 대고 간다. 연타 중엔 내리지 않고 앞뒤로 밀며 간다(닿아 있는 동안 떤다)
  grinder: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 0.85, -0.15, { lF: 11, sl: 0.9 }),
    a: {
      wind: two([1, -38], [-1, -14.5], [12, 0], [-12, 0], -0.3, UP + 0.5, { lF: 9, sl: 0.9 }),
      hit: two([2, -42], [0, -17], [12, 0], [-12, 0], UP + 0.2, UP + 0.4, { lF: 16, sl: 0.95, eF: 3 }),
      follow: two([-1, -42.5], [0, -17.5], [12, 0], [-12, 0], UP - 0.2, UP - 0.35, { lF: 16, sl: 0.95, eF: 3 }),
    },
    b: {
      wind: two([-1, -41], [0, -16], [12, 0], [-12, 0], UP - 0.25, UP - 0.45, { lF: 13, sl: 0.95, eF: 3 }),
      hit: two([-2, -42], [0, -17], [12, 0], [-12, 0], UP - 0.2, UP - 0.35, { lF: 16, sl: 0.95, eF: 3 }),
      follow: two([2, -42.5], [0, -17.5], [12, 0], [-12, 0], UP + 0.25, UP + 0.4, { lF: 16, sl: 0.95, eF: 3 }),
    },
    rec: 8,
    buzz: true,
    long: 0.86,
  },
  // 삽 — 퍼 올린다. 앞 바닥에 삽날을 대고 서 있다가 낮게 앉아 앞으로 떠서, 일어서며 머리 위로 퍼 올리고 뒤로 넘긴다
  shovel: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 0.95, 0.95, { lF: 12, sl: 1.15 }),
    a: {
      wind: two([8, -31], [-3, -11.5], [13, 0], [-12, 0], 0.75, 0.3, { lF: 12, sl: 1.25 }),
      hit: two([2, -50], [1, -24], [10, -5], [-8, 0], UP + 0.15, UP + 0.3, { lF: 16, sl: 1.3 }),
      follow: two([-4, -46], [0, -21], [9, 0], [-12, 0], UP - 0.35, UP - 0.7, { lF: 15, sl: 1.25 }),
    },
    rec: 11,
    long: 1.15,
    heft: 1.3,
  },
  // 곡괭이 — 크게 쳐들었다 찍는다. 등 뒤 위로 높이 쳐들었다가 몸을 앞으로 접으며 머리 위를 찍고, 앞 아래로 떨군다
  pickaxe: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 1.0, 1.35, { lF: 12, sl: 1.15 }),
    a: {
      wind: two([-5, -47], [1, -21], [10, 0], [-12, 0], -2.2, -2.45, { lF: 15, sl: 1.2 }),
      hit: two([4, -49], [0, -23], [11, 0], [-10, 0], UP + 0.25, UP + 0.45, { lF: 16, sl: 1.25, eF: 2 }),
      follow: two([10, -35], [-2, -14.5], [13, 0], [-12, 0], 0.55, 0.55, { sl: 1.2 }),
    },
    rec: 13,
    long: 1.1,
    heft: 2,
  },
  // 착암기 — 가장 무겁다. 두 손으로 몸 앞에 안고 서 있다가 다리를 벌리고 머리 위로 밀어 올려 댄다. 닿아 있는 동안 떤다(다다다)
  jackhammer: {
    stand: two([0, -47], [0, -21.5], [8, 0], [-8, 0], 0.55, UP + 0.12, { lF: 10, sl: 1.45 }),
    a: {
      wind: two([2, -35], [-2, -12], [14, 0], [-13, 0], 0.35, UP + 0.12, { lF: 9, sl: 1.45 }),
      hit: two([1, -51], [0, -25], [12, -3], [-12, -3], UP + 0.06, UP + 0.04, { lF: 16, sl: 1.6, eF: 3 }),
      follow: two([0, -41], [0, -16.5], [13, 0], [-13, 0], -0.25, UP + 0.1, { lF: 12, sl: 1.5, eF: 3 }),
    },
    b: {
      wind: two([0, -41], [0, -16.5], [13, 0], [-13, 0], -0.25, UP - 0.06, { lF: 12, sl: 1.5, eF: 3 }),
      hit: two([-1, -51], [0, -25], [12, -3], [-12, -3], UP - 0.06, UP - 0.04, { lF: 16, sl: 1.6, eF: 3 }),
      follow: two([0, -41], [0, -16.5], [13, 0], [-13, 0], -0.25, UP - 0.08, { lF: 12, sl: 1.5, eF: 3 }),
    },
    rec: 15,
    buzz: true,
    long: 0.95,
    heft: 2.5,
  },
  // 비계 파이프 — 가장 길다. 뒤로 당겨 겨누고 발끝으로 서며 머리 위로 곧게 뻗어 올리고, 앞으로 길게 휘둘러 내린다. 연타는 뒤로 되휘두른다
  pipe: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 0.95, 1.3, { lF: 12, sl: 1.45 }),
    a: {
      wind: two([-3, -44], [-2, -19], [10, 0], [-13, 0], 0.45, -0.35, { lF: 9, sl: 1.5 }),
      hit: two([3, -51], [1, -24.5], [9, -4], [-8, 0], UP + 0.08, UP + 0.06, { lF: 16, sl: 1.55 }),
      follow: two([7, -43], [0, -18.5], [12, 0], [-11, 0], -0.4, -0.3, { lF: 15, sl: 1.5 }),
    },
    b: {
      wind: two([7, -43], [0, -18.5], [12, 0], [-11, 0], -0.4, -0.3, { lF: 15, sl: 1.5 }),
      hit: two([-2, -51], [0, -24.5], [8, 0], [-8, -4], UP - 0.08, UP - 0.1, { lF: 16, sl: 1.55 }),
      follow: two([-5, -44], [0, -19], [10, 0], [-12, 0], -2.5, BACK + 0.45, { lF: 15, sl: 1.5 }),
    },
    rec: 10,
    long: 1.3,
  },
  // 전동 드릴 — 가장 가볍다. 한 손으로 권총처럼 쥐고 서 있다가 몸 앞에 세워 겨누고, 팔을 곧게 뻗어 머리 위로 밀어 넣는다. 누르는 동안 떤다
  drill: {
    stand: pose([0, -48], [0, -22], [7, 0], [-7, 0], 0.55, PI - 1.15, -0.75, { sl: 0.95 }),
    a: {
      wind: pose([2, -42], [-1, -17.5], [11, 0], [-11, 0], -0.15, PI - 1.1, UP + 0.25, { lF: 10, sl: 0.95 }),
      hit: pose([2, -50], [0, -23.5], [9, -2], [-8, 0], UP + 0.12, PI - 1.2, UP + 0.04, { lF: 16, sl: 1.1 }),
      follow: pose([1, -46], [0, -20.5], [10, 0], [-9, 0], UP + 0.35, PI - 1.2, UP + 0.12, { lF: 14, sl: 1.05 }),
    },
    rec: 7,
    buzz: true,
    long: 0.8,
    oneHand: true,
  },
  // 코어 드릴 — 두 손으로 비스듬히 받쳐 들고 서 있다가, 앉아 몸에 붙여 겨누고, 앞발을 앞으로 내며 머리 위 앞으로 밀어 올린다. 뚫는 동안 떤다
  coredrill: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 0.75, UP + 0.1, { lF: 11, sl: 1.25 }),
    a: {
      wind: two([3, -36], [-2, -13], [12, 0], [-12, 0], 0.15, UP + 0.3, { lF: 9, sl: 1.25 }),
      hit: two([5, -47], [0, -21], [14, 0], [-12, 0], UP + 0.3, UP + 0.16, { lF: 16, sl: 1.35, eF: 2 }),
      follow: two([4, -44], [0, -19], [14, 0], [-12, 0], UP + 0.5, UP + 0.26, { lF: 14, sl: 1.3, eF: 2 }),
    },
    rec: 12,
    buzz: true,
    long: 1,
    heft: 2,
  },
  // 굴착 드릴 — 가장 크고 무겁다. 날을 앞 바닥에 겨눈 채 서 있다가, 다리를 벌리고 앉아 손잡이를 감아쥐고, 온몸으로 크게 돌려 머리 위로 세운다. 도는 동안 떤다
  auger: {
    stand: two([0, -48], [0, -22], [8, 0], [-8, 0], 0.75, 0.55, { lF: 11, sl: 1.35 }),
    a: {
      wind: two([5, -33], [-3, -11.5], [14, 0], [-14, 0], 0.55, 0.15, { lF: 10, sl: 1.35 }),
      hit: two([0, -46], [0, -20], [14, 0], [-14, 0], UP + 0.1, UP + 0.02, { lF: 16, sl: 1.5, eF: 3 }),
      follow: two([-1, -43], [0, -17.5], [14, 0], [-14, 0], UP - 0.05, UP - 0.08, { lF: 15, sl: 1.45, eF: 3 }),
    },
    rec: 18,
    buzz: true,
    long: 1.15,
    heft: 3,
  },
  // 무쇠 — 대검의 기준. 깊이 앉아 칼끝을 앞 바닥에 대고 있다가 일어서며 머리 위로 크게 넘겨 뒤로 떨군다. 연타는 뒤에서 넘겨 낮은 런지로 내리친다
  iron: {
    stand: STAND_GREAT,
    a: {
      wind: two([5, -34], [-4, -13], [11, 0], [-13, 0], 0.9, 0.45),
      hit: two([-3, -46], [1, -19], [12, 0], [-11, 0], UP - 0.08, UP - 0.2, { lF: 16, sl: 1.1, eF: 2 }),
      follow: two([9, -33], [1, -13], [14, 0], [-13, 0], 2.5, BACK - 0.4),
    },
    b: {
      wind: two([8, -34], [1, -13.5], [14, 0], [-13, 0], 2.45, BACK - 0.45),
      hit: two([4, -46], [0, -19], [11, 0], [-13, 0], UP + 0.1, UP + 0.2, { lF: 16, sl: 1.1, eF: 2 }),
      follow: two([12, -30], [-3, -14], [12, 0], [-21, 0], 0.55, 0.3, { sl: 1.08 }),
    },
    rec: 12,
  },
  // 톱날 — 다리를 벌려 버티고 칼을 비스듬히 세워 밑면에 댄다. 칼 길이 방향으로 밀어 올리고(a) 몸 쪽으로 당겨(b) 켠다
  saw: {
    stand: STAND_GREAT,
    a: {
      wind: two([1, -41], [-3, -17], [11, 0], [-13, 0], -0.2, -1.0, { lF: 8, eF: 3 }),
      hit: two([4, -44], [0, -19], [12, 0], [-12, 0], -1.05, -1.05, { lF: 16, sl: 1.05 }),
      follow: two([5, -44.5], [1, -19.5], [12, 0], [-12, 0], -1.1, -1.1, { lF: 16, sl: 1.05 }),
    },
    b: {
      wind: two([5, -44], [1, -19], [12, 0], [-12, 0], -1.1, -1.1, { lF: 16, sl: 1.05 }),
      hit: two([1, -41], [-3, -17], [11, 0], [-13, 0], -0.25, -1.0, { lF: 8, eF: 3 }),
      follow: two([0, -40], [-4, -16], [11, 0], [-13, 0], 0.05, -0.95, { lF: 7, eF: 3 }),
    },
    rec: 10,
  },
  // 공사중 — 칼끝을 뒤 바닥에 끌다가 뛰어오르며 뒤에서 위로 올려 친다(띄우기). 앞 위에 든 채 내려선다
  hazard: {
    stand: STAND_GREAT,
    a: {
      wind: two([4, -34], [-4, -13.5], WIDE_F, WIDE_B, 2.3, BACK - 0.45),
      hit: two([3, -54], [2, -29], [9, -12], [-3, -7], UP + 0.2, UP + 0.25, { lF: 16, sl: 1.1 }),
      follow: two([4, -46], [1, -20], [11, 0], [-9, 0], -0.95, -0.8, { lF: 15 }),
    },
    rec: 11,
  },
  // 철골 — 가장 무겁다. 어깨에 메고 깊이 앉았다가 다리를 앞뒤로 찢으며 머리 위로 받쳐 올린다(역도의 저크). 무릎이 꺾이며 가장 늦게 선다
  beam: {
    stand: pose([0, -48], [0, -22], [7, 0], [-7, 0], 0.1, 'grip', 0.35 - PI, { lF: 9 }),
    a: {
      wind: pose([1, -35], [-1, -11.5], [10, 0], [-10, 0], 0.2, 'grip', 0.3 - PI, { lF: 8 }),
      hit: two([1, -44], [0, -17.5], [13, 0], [-13, 0], UP + 0.05, UP, { lF: 16, sl: 1.05, eF: 2 }),
      follow: two([1, -39], [0, -14.5], [13, 0], [-13, 0], UP + 0.3, UP - 0.2, { lF: 12 }),
    },
    rec: 18,
    heft: 3,
  },
  // 벽돌 — 뭉툭하고 무겁다. 등 뒤로 높이 메었다가 머리 위를 지나 앞 바닥으로 내리찍는다. 연타는 앞에서 다시 메어 올린다
  brick: {
    stand: STAND_GREAT,
    a: {
      wind: two([-4, -44], [1, -19.5], [10, 0], [-13, 0], -2.3, BACK + 0.6, { lF: 15 }),
      hit: two([3, -47], [0, -21], [12, 0], [-11, 0], UP + 0.2, UP + 0.15, { lF: 16, sl: 1.08, eF: 2 }),
      follow: two([10, -31], [-3, -11.5], [14, 0], [-14, 0], 0.7, 0.5, { sl: 1.05 }),
    },
    b: {
      wind: two([10, -32], [-3, -12], [14, 0], [-14, 0], 0.7, 0.5, { sl: 1.05 }),
      hit: two([-2, -47], [0, -21], [11, 0], [-12, 0], UP - 0.15, UP - 0.2, { lF: 16, sl: 1.08, eF: 2 }),
      follow: two([-5, -42], [1, -18], [10, 0], [-13, 0], -2.4, BACK + 0.55, { lF: 14 }),
    },
    rec: 14,
    heft: 2,
  },
  // 철근 — 다발을 낮게 옆에 끌다가 앞으로 나가며 곧추 올려 뻗고, 머리 위 뒤로 젖혀 든다. 연타는 앞 아래로 내리친다
  rod: {
    stand: STAND_GREAT,
    a: {
      wind: two([4, -38], [-2, -15], [12, 0], [-12, 0], 0.55, 0.25, { lF: 11 }),
      hit: two([6, -49], [1, -22], [14, 0], [-10, 0], UP + 0.15, UP + 0.08, { lF: 16, sl: 1.12, eF: 2 }),
      follow: two([-2, -47], [1, -21], [11, 0], [-11, 0], UP - 0.35, UP - 0.6, { lF: 16 }),
    },
    b: {
      wind: two([-2, -47], [1, -21], [11, 0], [-11, 0], UP - 0.35, UP - 0.6, { lF: 16 }),
      hit: two([-3, -49], [0, -22], [10, 0], [-13, 0], UP - 0.1, UP - 0.12, { lF: 16, sl: 1.12, eF: 2 }),
      follow: two([7, -38], [-2, -15], [13, 0], [-12, 0], 0.6, 0.3, { lF: 12 }),
    },
    rec: 11,
  },
  // 유리 — 가장 길고 가볍게 긋는다. 뒤 아래에 눕혀 들었다가 발끝으로 서며 뒤 아래에서 앞 위로 길게 그어 올리고, 앞 위로 뻗은 채 멈춘다. 연타는 되돌아온다
  glass: {
    stand: STAND_GREAT,
    a: {
      wind: two([-3, -45], [0, -20], [9, 0], [-11, 0], 2.3, BACK - 0.5, { lF: 13, sl: 1.15 }),
      hit: two([2, -51], [0, -24.5], [7, -3], [-8, 0], UP + 0.15, UP + 0.1, { lF: 16, sl: 1.25 }),
      follow: two([4, -50], [0, -24], [8, -2], [-9, 0], -0.75, -0.55, { lF: 16, sl: 1.2 }),
    },
    b: {
      wind: two([4, -49], [0, -23.5], [8, 0], [-9, 0], -0.75, -0.55, { lF: 16, sl: 1.2 }),
      hit: two([-1, -51], [0, -24.5], [7, 0], [-8, -3], UP - 0.1, UP - 0.15, { lF: 16, sl: 1.25 }),
      follow: two([-3, -46], [0, -20.5], [9, 0], [-11, 0], 2.3, BACK - 0.5, { lF: 13, sl: 1.15 }),
    },
    rec: 9,
    long: 1.15,
  },
  // 불꽃 — 제자리에서 돌며 벤다. 뒤로 감았다가 머리 위로 쳐올리고, 그대로 반 바퀴 돌아 등을 보인 채 선다. 연타는 남은 반 바퀴
  flame: {
    stand: STAND_GREAT,
    a: {
      wind: two([-3, -41], [-1, -17.5], [9, 0], [-10, 0], 2.4, BACK - 0.3, { lF: 12 }),
      hit: two([3, -47], [0, -21], [11, 0], [-10, 0], UP + 0.35, UP + 0.45, { lF: 16, sl: 1.1 }),
      follow: two([4, -45], [0, -20.5], [9, 0], [-9, 0], -0.75, -0.55, { lF: 15, turn: -1 }),
    },
    b: {
      wind: two([3, -42], [0, -18], [9, 0], [-9, 0], -0.2, -0.1, { lF: 12, turn: -1 }),
      hit: two([3, -47], [0, -21], [11, 0], [-10, 0], UP + 0.35, UP + 0.45, { lF: 16, sl: 1.1, turn: -1 }),
      follow: two([4, -45], [0, -20.5], [9, 0], [-9, 0], -0.75, -0.55, { lF: 15 }),
    },
    rec: 10,
  },
  // 서리 — 가장 길다. 앉지 않는다. 곧게 선 채 팔을 다 뻗어 앞 아래에서 머리 위로 길게 넘기고 뒤에 눕혀 든다. 연타는 되돌아온다
  frost: {
    stand: STAND_GREAT,
    a: {
      wind: two([-1, -46], [0, -20.5], [8, 0], [-8, 0], 0.55, 0.35, { sl: 1.1 }),
      hit: two([-2, -50], [0, -23.5], [8, 0], [-6, -3], UP + 0.02, UP - 0.05, { lF: 16, sl: 1.2 }),
      follow: two([2, -47.5], [0, -22], [9, 0], [-8, 0], BACK + 0.55, BACK + 0.1, { lF: 15, sl: 1.1 }),
    },
    b: {
      wind: two([2, -47], [0, -21.5], [9, 0], [-8, 0], BACK + 0.5, BACK + 0.05, { lF: 15, sl: 1.1 }),
      hit: two([2, -50], [0, -23.5], [6, -3], [-8, 0], UP - 0.02, UP + 0.05, { lF: 16, sl: 1.2 }),
      follow: two([-1, -47.5], [0, -22], [8, 0], [-9, 0], -0.45, -0.12, { lF: 15, sl: 1.1 }),
    },
    rec: 12,
    long: 1.1,
  },
  // 흑철 — 칼끝을 앞 바닥에 박았다가 허리를 젖히며 하늘로 찢어 올린다. 뒤 위로 치켜든 채 버틴다
  onyx: {
    stand: STAND_GREAT,
    a: {
      wind: two([7, -33], [-3, -13], [11, 0], [-14, 0], 0.9, 0.95),
      hit: two([-4, -47], [2, -20], [11, 0], [-9, 0], UP - 0.1, UP - 0.15, { lF: 16, sl: 1.12, eF: 2 }),
      follow: two([-7, -44], [2, -19.5], [11, 0], [-9, 0], UP - 0.6, UP - 0.95, { lF: 16 }),
    },
    rec: 12,
    heft: 1.5,
  },
  // 황금 — 한 손. 몸 앞에 세워 겨누었다가 발끝으로 서며 곧은 몸으로 곧추 뻗고 칼끝을 튕긴다(뒷손은 허리 뒤)
  gold: {
    stand: { ...STAND_GREAT, hB: [-5, -26], eB: -2 },
    a: {
      wind: pose([1, -43], [-1, -18], [10, 0], [-9, 0], 0.5, PI - 1.1, UP + 0.45, { lF: 8, eB: -3 }),
      hit: pose([-1, -51], [0.5, -24.5], [4, -1], [-4, -1], UP + 0.05, PI - 1.1, UP, { lF: 16, sl: 1.12, eB: -3 }),
      follow: pose([1, -49], [0, -23], [6, 0], [-6, 0], UP + 0.25, PI - 1.1, UP + 0.5, { lF: 15, eB: -3 }),
    },
    b: {
      wind: pose([1, -43], [-1, -18], [10, 0], [-9, 0], 0.3, PI - 1.1, UP - 0.1, { lF: 8, eB: -3 }),
      hit: pose([-1, -51], [0.5, -24.5], [4, -1], [-4, -1], UP - 0.05, PI - 1.1, UP - 0.12, { lF: 16, sl: 1.12, eB: -3 }),
      follow: pose([-1, -49], [0, -23], [6, 0], [-6, 0], UP - 0.25, PI - 1.1, UP - 0.55, { lF: 15, eB: -3 }),
    },
    rec: 9,
    oneHand: true,
  },
};

/** 장착 무기의 서기와 특성 — 필살 시간표의 처음 · 끝 키가 이 서기다 */
export function kitOf(w: WeaponId): Kit {
  return STYLE[w];
}

/** 연타 몇 번째 휘두름인가 — 홀수 번째는 되돌아오는 휘두름(b). 끊기면 0부터 */
let swing = 0;
const CHAIN = 10; // 앞 베기가 끝나고 이 틱 안에 또 베면 연타로 잇는다

const swingOf = (st: Style): Swing => (swing % 2 && st.b) || st.a;

function attack(st: Style, t: number): Body {
  const w = swingOf(st);
  // 쳐듦 → 한 틱에 닿음(히트스톱이 이 자세에서 멎는다) → 한 틱 더 밀어 넣고 → 지나간다
  const b = play([[0, w.wind], [1, w.hit, hold], [2, sink(w.hit, -1)], [4.5, w.follow, out]], t);
  if (!st.buzz || t < 1) return b;
  const d = Math.floor(t) % 2 ? 0.7 : -0.7; // 가는 동안 손이 떤다
  return { ...b, hF: [b.hF[0] + d, b.hF[1] - d], hB: [b.hB[0] + d, b.hB[1] - d] };
}

const tips = new Map<string, readonly number[]>();
/** 지금 휘두름의 쳐듦 → 닿음 사이 칼끝이 지나간 길(발 기준 x, y 열한 점 · 닿은 쪽이 먼저) — 참격 호가 이 길을 따라 그려진다 */
export function slashOf(w: WeaponId): readonly number[] {
  const st = STYLE[w];
  const sw = swingOf(st);
  const key = w + (sw === st.a ? 'a' : 'b');
  let pts = tips.get(key);
  if (!pts) {
    const L = greatLook(w) ? GREAT_L : SWORD_L;
    const out11: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const b = mix(sw.hit, sw.wind, i / 10);
      out11.push((b.hF[0] + Math.cos(b.sa) * L * b.sl) * b.turn, b.hF[1] + Math.sin(b.sa) * L * b.sl);
    }
    tips.set(key, (pts = out11));
  }
  return pts;
}

/** 공중 베기 — 윗몸은 그대로, 다리만 접어 든다 */
function inAir(b: Body): Body {
  const dy = -24 - b.hip[1];
  const m = (p: Pt): [number, number] => [p[0], p[1] + dy];
  const hip = m(b.hip);
  return { ...b, head: m(b.head), hip, hF: m(b.hF), hB: m(b.hB), fF: [hip[0] + 9, hip[1] + 13], fB: [hip[0] - 8, hip[1] + 16] };
}

// ── 점프 — 뻗으며 뜀 → 웅크림 → 내려오며 칼을 쳐듦. 속도(vy)로 자리를 정한다(가드로 튕겨도 맞는다) ──
const J_UP = pose([5, -51], [0, -25.5], [-3, -3.5], [-9, -5], 2.3, -1.0, 2.5);
const J_TUCK = pose([10, -44], [-1, -26], [5, -12], [1, -11], PI - 0.25, 0.95, PI - 0.3, { eB: 2.5 });
const J_FALL = pose([2, -50], [0, -25], [5, -7], [-6, -3], 2 * PI - 1.85, -0.5, 2 * PI - 2.3, { lF: 16, eF: -2.5 });
const J_LAND = pose([5, -31], [-3, -11.5], [9, 0], [-11, 0], 1.0, 2.4, 0.55, { eB: -1.5 });

function jump(vy: number): Body {
  const u = Math.min(1, Math.max(0, (1 - vy / PLAYER.JUMP_V0) / 2));
  return play([[0, J_UP], [14, J_TUCK, out], [58, sink(J_TUCK, 0.8)], [80, J_FALL], [96, sink(J_FALL, -1)]], u * 96);
}

// ── 가드 — 칼을 머리 위에 가로로 받치고 버틴다 ──
function guard(head: Pt, hip: Pt, fF: Pt, fB: Pt): Body {
  const y = head[1] - 10;
  return { head, hip, fF, fB, hF: [-10, y], hB: [9, y], sa: 0, sl: 1.05, eF: -3, eB: 3, turn: 1 };
}
const G_GROUND = guard([0, -44], [0, -18], [9, 0], [-9, 0]);
const G_AIR = guard([0, -48], [0, -23], [8, -10], [-5, -9]);
const G_BREAK = pose([-6, -45], [0, -22], [6, 0], [-10, -2], 0.35, PI + 0.35, 1.05);

/** 대기 숨 — 80틱에 한 번 천천히 가라앉고 칼끝이 따라 흔들린다 */
function breathe(st: Body, tick: number): Body {
  const u = (1 - Math.cos((2 * PI * tick) / 80)) / 2;
  return sink(st, 0.9 * u, 0.05 * u);
}

/** 새 자세로 넘어올 때 직전 몸에서 잇는 틱 수 — 0 = 바로 */
function blendTicks(to: PlayerPose, from: PlayerPose, rec: number): number {
  if (to === 'attack' || to === 'guardBreak') return 0;
  if (to === 'guardG' || to === 'guardA') return 2;
  if (to === 'jump') return from === 'idle' ? 0 : 6; // 땅에서 뛸 땐 바로 뻗는다
  if (to !== 'idle') return 0;
  if (from === 'attack') return rec; // 무거운 무기일수록 천천히 일어선다
  if (from === 'jump' || from === 'guardA') return 0; // 착지는 제 시간표가 있다
  return 6;
}

let cur: PlayerPose = 'idle';
let prev: PlayerPose = 'idle';
let at = 0; // 지금 자세가 시작한 틱
let last = -1;
let atkEnd = -99; // 마지막으로 베기 자세였던 틱
let atkTick = 0; // 그때의 poseTick
let drawn: Body | null = null; // 직전에 그린 몸
let from: Body | null = null; // 자세가 바뀐 순간의 몸

/** 판 졸라맨의 평소 몸 — 깔림 · 사망(납작한 구운 프레임)과 필살(wazaBody)은 null */
export function moveBody(s: GameState): Body | null {
  const p = s.player;
  if (s.tick < last) { cur = p.pose; prev = 'idle'; at = s.tick - 999; drawn = from = null; swing = 0; atkEnd = -99; } // 새 판
  last = s.tick;
  // 새 베기 — 자세가 베기로 바뀌었거나, 그리지 못한 틱 사이에 다음 베기가 시작됐다(poseTick이 되감김)
  if (p.pose === 'attack') {
    if (cur !== 'attack' || p.poseTick < atkTick) swing = s.tick - atkEnd <= CHAIN ? swing + 1 : 0;
    atkEnd = s.tick;
    atkTick = p.poseTick;
  }
  if (p.pose !== cur) { prev = cur; cur = p.pose; at = s.tick; from = drawn; }
  const dt = s.tick - at;
  const style = STYLE[s.weapon];
  const st = style.stand;
  let b: Body;
  switch (p.pose) {
    case 'attack': b = p.attackFromAir ? inAir(attack(style, p.poseTick)) : attack(style, p.poseTick); break;
    case 'jump': b = jump(p.vy); break;
    case 'guardG': b = play([[0, G_GROUND], [PLAYER.GUARD_STARTUP_GROUND, sink(G_GROUND, 1.5), out]], p.poseTick); break;
    case 'guardA': b = G_AIR; break;
    case 'guardBreak': b = play([[0, G_BREAK], [3, sink(G_BREAK, 2), out], [PLAYER.GUARD_BREAK_STUN, G_BREAK]], p.poseTick); break;
    case 'idle':
      // 착지 — 주저앉았다 일어선다
      b = (prev === 'jump' || prev === 'guardA') && dt < 15
        ? play([[0, J_LAND], [3, sink(J_LAND, 1.5), out], [15, st]], dt)
        : breathe(st, s.tick);
      break;
    default: drawn = from = null; return null;
  }
  const n = blendTicks(cur, prev, style.rec);
  if (from && dt < n) b = mix(from, b, out(dt / n));
  drawn = b;
  return b;
}
