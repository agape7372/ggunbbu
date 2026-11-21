// 고드름 대검(얼음) 레시피 — 4판(11-21 방향표 「고드름」 절) · 11-22 검수 고침. 공통 달(moonsFor · paintMoon)은 쓰지 않는다. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 곧은 모서리 · 각진 면의 결정 덩이(다섯 중 이것만). 결정 하나 = 뿌리가 가장 두껍고 곧게 좁아져 끝이 뾰족한 쐐기 한 획(튕김 누름)이고,
// 큰 결정은 위쪽 옆에 밝은 면 한 장을 덧그어 뿌리 → 끝 능선 한 줄이 선다(먹 머리 · 색 꼬리 면 + 밝은 면 = 각진 면 둘).
// 덩이 = 한가운데 가장 큰 결정 + 둘레 작은 결정(길이 몫 1 → 0.1) + 큰 결정 옆에서 솟은 곁가지 + 뒤에 마른 붓 먹 결정 겹. 모두 한쪽 대각(왼쪽 위 = 건물 쪽)으로 기운다.
// 박자: 박힘(2프레임에 다 그어진다 · 큰 것부터 한 프레임씩 늦게) → 얼어 멈춤(움직임 0, 완파 10프레임 안팎) → 쩍(큰 결정을 가로지르는 먹 금) →
// 두 프레임 뒤 큰 결정 끝 몫이 먼저 떨어져 나가고 남은 결정도 기울며 떨어진다 + 크기 제각각(1:10) 세모 조각이 한쪽(왼쪽) 부채로 돌며 느리게 떨어진다.
// (11-22 검수: 붓 획은 뿌리부터 깎여서 제자리에 두면 결정 끝이 공중에 떠 새처럼 보였다 — 그래서 쩍 뒤엔 결정 자체를 떨군다)
// 자료: MK11 서브제로 얼음 덩이 · 산산조각(S6 · S7) · 80.lv 비스듬한 큰 결정 + 곁가지(S12) · 결정 터짐 가지 길이 제각각(S13) · itch 결정 한 송이(S15) ·
// UE 높이 다른 기둥 무리(S14 — 천지개벽 땅 기둥).
// 자리: 오른쪽 아래 「콤보」 도장을 비우려고 결정은 왼쪽 위로 기울고 조각도 왼쪽으로 흩어진다. 뿌리는 주인공 몸(발 위 0~60 · 좌우 ±18) 밖으로 비킨다.
// 갈림: 서리 = 땅 한 점에서 위로 곧게 솟는 가는 가시 부채 · 오닉스 = 사선 누름 획 하나 · 번개 = 내리꽂는 꺾인 줄기. 이쪽은 굵고 각진 결정 여럿이 한쪽으로 기운 덩이 + 산산조각.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW } from '../../config';
import { bent, later, line, n01, pool, put, scaled, sgn, type Bit, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, moonPts, pathLen, swingMoon } from './geom';

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;
const INK = PALETTE.INK;
const G = VIEW.GROUND_Y;
/** 기우는 각(수직에서) — 대각이지만 화면 위로 키를 벌려고 45°보다 세운다 */
const TILT = 0.56;
/** 쩍 — 큰 결정이 이 몫에서 끊겨 끝이 먼저 떨어진다(첫 금도 여기) */
const CUT = 0.64;
/** 삶 L초인 획이 f프레임 만에 다 그어지는 몫(키운 그림은 삶이 1.2배라 그만큼 나눈다) */
const grIn = (f: number, L: number): number => Math.min(0.4, f / 60 / (L * 1.2));

/** 곁가지 — [큰 결정 위 자리 0~1, 옆(−1 아래 · +1 위 = 오른쪽 옆구리), 길이 몫, 벌어지는 각] */
type Twig = readonly [number, number, number, number];
/**
 * 크기(키우기 전 · 사건 그림은 scaled 1.6배). L = 가장 큰 결정 길이 · W = 뿌리 폭 / 길이 · sub = 둘레 결정 길이 몫(큰 것부터) ·
 * face = 밝은 면을 덧그을 둘레 결정 수 · twig = 곁가지 · back = 뒤 먹 결정 · sh = 조각 수 [큰, 가운데, 가루] · life = 결정이 사는 초
 * (4할까지 그대로 선다 = 쩍) · crack = 금 수 · root = 친 자리 → 뿌리(기우는 반대쪽 옆 · 위)
 */
interface Size {
  L: number; W: number; sub: readonly number[]; face: number; twig: readonly Twig[]; back: readonly Back[];
  sh: readonly [number, number, number]; life: number; crack: number; root: readonly [number, number];
}
/** 뒤 먹 결정 — [옆, 앞, 돌림, 길이 몫]. 뿌리는 큰 결정 몸 뒤로 올린다 */
type Back = readonly [number, number, number, number];
const BACK: readonly Back[] = [[-0.5, 0.6, -0.3, 0.5], [0.75, 0.25, 0.3, 0.36]];
const TWIG: readonly Twig[] = [[0.36, -1, 0.3, 0.62], [0.6, 1, 0.19, 0.62]];
const SIZE = {
  whiff: { L: 22, W: 0.34, sub: [0.5], face: 0, twig: [], back: [], sh: [0, 1, 1], life: 0.22, crack: 0, root: [0, 0] },
  // 타격은 한 단계 크게(폭 120~140) — 오른쪽 옆구리에 곁가지 셋
  hit: {
    L: 70, W: 0.31, sub: [0.6, 0.34, 0.18], face: 1, back: [BACK[0]], sh: [2, 2, 4], life: 0.25, crack: 1, root: [14, -20],
    twig: [[0.36, -1, 0.28, 0.62], [0.22, 1, 0.32, 0.48], [0.45, 1, 0.23, 0.8], [0.67, 1, 0.14, 0.58]],
  },
  floor: { L: 94, W: 0.31, sub: [0.62, 0.4, 0.24, 0.13], face: 2, twig: TWIG, back: [BACK[0]], sh: [2, 4, 7], life: 0.3, crack: 2, root: [20, -30] },
  destroy: { L: 143, W: 0.3, sub: [0.58, 0.42, 0.27, 0.16, 0.1], face: 2, twig: TWIG, back: BACK, sh: [3, 6, 12], life: 0.32, crack: 2, root: [24, -26] },
} satisfies Record<string, Size>;
/** 천지개벽 땅 기둥 — 곧은 모서리 결정 쐐기 하나(길이는 부를 때) + 왼쪽 뒤 먹 기둥(더 세워서 · 오른쪽 뒤 기둥은 주인공 머리 · 몸을 덮었다) + 오른쪽 곁가지 하나 */
const PILLAR: Size = { L: 0, W: 0.24, sub: [], face: 1, twig: [[0.42, 1, 0.22, 0.55]], back: [[-0.55, 0.35, 0.22, 0.42]], sh: [1, 2, 4], life: 0.5, crack: 1, root: [0, 0] };
/** 기둥 차례마다 [높이 몫, 기우는 각(수직에서)] — 이웃끼리 높이 · 기울기가 같지 않게 */
const PILLAR_AT = [[1, 0.42], [0.7, 0.62], [0.86, 0.34], [0.58, 0.55], [0.95, 0.48]] as const;
let pillarN = 0;
/** 연타 세 번의 각 — 왼쪽 위 쏠림은 그대로, 수직에서 21° · 45° · 33°(차례끼리 12~24° 다르다) */
const SWAY = [0.19, -0.23, -0.02] as const;
let hitN = 0;

/** 둘레 결정 자리(큰 것부터) — [능선 옆으로(큰 결정 폭 단위, + = 위쪽 옆), 앞으로(같은 단위, + = 결정이 가는 쪽)].
 *  간격 · 쪽이 고르지 않게. 아래쪽 옆 결정은 앞으로 올려 뿌리를 띄운다(뿌리 먹이 한데 뭉치면 주인공 머리 위 검은 덩어리가 됐다) */
const SPOT = [[0.95, -0.1], [-0.5, 0.3], [1.75, -0.3], [-0.95, 0.6], [2.45, -0.45]] as const;
/** 칼 기운 결정 — [날 위 자리(0 손 → 1 칼끝), 길이, 날 위쪽 옆으로 기우는 몫, 나오는 차례]. 칼끝부터 날 중간까지 차례로 타고 오른다 */
const AURA = [[0.93, 44, 0.4, 0], [0.71, 36, 0.9, 0], [0.48, 29, 0.55, 1], [0.26, 22, 1.15, 2]] as const;

/** a 쪽 결정의 위쪽 옆(단위 법선, y ≤ 0)과 그쪽으로 돌리는 부호 */
function upSide(a: number): [number, number, number] {
  const [nx, ny] = [-Math.sin(a), Math.cos(a)];
  return ny > 0 ? [-nx, -ny, -1] : [nx, ny, 1];
}

/** 쥔 칸 — [칸, 그때 seed](칸이 다른 조각에 다시 쓰였으면 seed가 다르다) */
type Held = [Bit, number];
/**
 * 이 안에서 새로 뿌린 칸들 — line · bent는 칸을 돌려주지 않아서 seed가 바뀐 칸을 찾는다(쩍 때 그 결정을 떨군다).
 * ponytail: 부를 때마다 풀(192칸)을 두 번 훑는다. 한 사건에 열 번 안팎이라 싸다 — line이 칸을 돌려주게 되면 그걸 쓴다
 */
function grab(draw: () => void): Held[] {
  const was = pool.map((p) => (p.alive ? p.seed : -1));
  draw();
  const out: Held[] = [];
  pool.forEach((p, i) => {
    if (p.alive && p.seed !== was[i]) out.push([p, p.seed]);
  });
  return out;
}

/**
 * 떨군다 — 쥔 칸들이 fs 쪽으로 기울며(돌며) 떨어진다. spd = 빠르기 배율 · left = 남은 삶 상한(나이 = 깎인 자리는 그대로).
 * 뿌리부터 깎이는 동안에도 남은 끝이 같이 떨어지니 공중에 뜨지 않는다
 */
function fall(held: readonly Held[], fs: number, spd: number, left: number): void {
  for (const [p, s] of held) {
    if (!p.alive || p.seed !== s) continue;
    p.vx = fs * (14 + 24 * n01()) * spd;
    p.vy = (8 + 18 * n01()) * spd;
    p.g = 230 * spd;
    p.spin = fs * (0.4 + 0.7 * n01()) * spd; // 왼쪽 위를 가리키던 결정이 왼쪽으로 넘어간다
    p.gr = 0.01; // 새로 떼어 낸 끝 조각은 단번에 선다(이미 선 결정엔 상관없다)
    const r = p.life / p.max;
    p.life = Math.min(p.life, left);
    p.max = p.life / r;
  }
}

/**
 * 결정 하나 — 뿌리 (x, y)에서 a 쪽으로 L, 뿌리 폭 W. 뿌리가 가장 두껍고 곧게 좁아져 끝이 뾰족하다(튕김 누름 = 곧은 모서리).
 * lit이면 밝은 면(밝은 짝 · 폭 0.42W)을 위쪽 옆에 덧그어 뿌리 → 끝 능선 한 줄이 선다. body = 몸 색(뒤 겹은 먹). 뿌린 칸을 돌려준다
 */
function crystal(x: number, y: number, a: number, L: number, W: number, c: string, life: number, lit = false, body = c, dry = 0.06): Held[] {
  return grab(() => {
    const [tx, ty] = [x + Math.cos(a) * L, y + Math.sin(a) * L];
    const gr = grIn(2, life);
    line(x, y, tx, ty, W, '', { body, pr: 1, dry, gr, life });
    if (!lit) return;
    const [nx, ny] = upSide(a);
    const w = W * 0.42;
    const o = (W - w) / 2 + W * 0.03; // 바깥 모서리는 몸과 같이, 안쪽 모서리가 능선
    line(x + nx * o, y + ny * o, tx, ty, w, '', { body: liteOf(c), pr: 1, dry: dry * 0.5, gr, life });
  });
}

/** 세모 조각 — tier 0 큰 · 1 가운데 · 2 가루(크기 1:10). fs 쪽 부채로 튀어 돌며 느리게 떨어진다. 셋에 하나 먹 */
function shard(x: number, y: number, tier: 0 | 1 | 2, W: number, fs: number, c: string, i: number): void {
  const th = -0.95 + 1.45 * n01(); // −0.95(위) ~ +0.5(아래), 옆은 fs 쪽
  const spd = [55, 95, 170][tier] * (0.7 + 0.6 * n01());
  const lite = liteOf(c);
  const cycle = [[c, INK, lite], [lite, c, INK], [lite, c, lite, INK]][tier]; // 조각 색 차례(가루는 넷에 하나 먹)
  const col = cycle[i % cycle.length];
  put('leaf', x, y, {
    vx: fs * Math.cos(th) * spd, vy: Math.sin(th) * spd, g: [200, 230, 260][tier], drag: [1.6, 1.8, 2.4][tier],
    life: [1.05, 0.9, 0.7][tier] + 0.2 * n01(), size: Math.max(0.9, W * [0.24, 0.12, 0.024][tier] * (0.8 + 0.4 * n01())),
    rot: n01() * TAU, spin: (n01() < 0.5 ? -1 : 1) * [2.4, 5, 11][tier] * (0.7 + 0.6 * n01()), c1: col, st: 3,
  });
}

/**
 * 한 덩이 — 친 자리 (x, y) 둘레 뿌리에서 a0 쪽으로 결정 덩이가 박히고 → 얼어 멈췄다 → 쩍 금 → 두 프레임 뒤 큰 결정 끝이 먼저 떨어져 나가고
 * 남은 결정 · 금도 fs 쪽으로 기울며 떨어지고 조각이 흩어진다. k = 콤보 단(크기는 조금만 큰다) · shift = 뿌리를 root만큼 옮길지(필살 마무리는 그 자리 그대로)
 */
function freeze(x: number, y: number, S: Size, k: number, c: string, a0: number, fs: number, shift = true): void {
  const q = 0.8 + 0.2 * Math.min(k, 2.25);
  const [L, W] = [S.L * q, S.L * q * S.W];
  const [x0, y0] = shift ? [x - fs * S.root[0] * q, y + S.root[1] * q] : [x, y];
  const [ux, uy] = [Math.cos(a0), Math.sin(a0)];
  const [nx, ny, turn] = upSide(a0);
  const at = (d: number, b: number): [number, number] => [x0 + (nx * d + ux * b) * W, y0 + (ny * d + uy * b) * W];
  /** 조각이 날 결정 — [뿌리 x, y, 끝 x, y, 폭] */
  const parts: number[] = [x0, y0, x0 + ux * L, y0 + uy * L, W];
  /** 쩍 때 떨굴 칸(큰 결정 빼고) */
  const held: Held[] = [];
  // 뒤 먹 결정 겹 — 마른 붓(색 없는 먹 쐐기). 한 프레임 늦게 앞 결정 뒤에서
  for (const [d, b, r, f] of S.back) {
    const [bx, by] = at(d, b);
    const a = a0 + turn * r + sgn() * 0.05;
    later(1 / 60, () => held.push(...crystal(bx, by, a, L * f, W * f * 1.1, c, S.life, false, INK, 0.38)));
  }
  const main = crystal(x0, y0, a0, L, W, c, S.life, S.face > 0); // 헛스윙만 밝은 면 없이
  S.sub.forEach((f, i) => {
    const [d, b] = SPOT[i];
    const [sx, sy] = at(d * (0.85 + 0.3 * n01()), b);
    const a = a0 + turn * (0.1 * d + sgn() * 0.05); // 바깥 결정일수록 바깥으로 조금 벌어진다(정원 부채가 아니게 한쪽만)
    const [l, w] = [L * f, W * f * (1.05 + 0.15 * n01())];
    parts.push(sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, w);
    later((0.6 + i * 0.8) / 60, () => held.push(...crystal(sx, sy, a, l, w, c, S.life, i < S.face)));
  });
  // 곁가지 — 큰 결정이 다 그어진 뒤 옆구리에서 바깥으로 비스듬히
  S.twig.forEach(([s, side, f, spread], i) => {
    const half = (W / 2) * (1 - s) ** 1.15 * 0.7;
    const [tx, ty] = [x0 + ux * L * s + nx * side * half, y0 + uy * L * s + ny * side * half];
    const a = a0 + turn * side * (spread + sgn() * 0.08);
    later((1.6 + i * 0.6) / 60, () => held.push(...crystal(tx, ty, a, L * f, W * f * 1.2, c, S.life * 0.95)));
  });
  const tc = S.life * 0.4;
  // 쩍 — 큰 결정을 가로지르는 각진 먹 금(첫 금이 끊기는 자리). 아직 움직이지 않는 결정 위에 두 프레임
  later(tc - 2 / 60, () => {
    for (let i = 0; i < S.crack; i++) {
      const s = i ? 0.34 + sgn() * 0.04 : CUT;
      const half = (W / 2) * (1 - s) ** 1.15 + 2;
      const [cx, cy] = [x0 + ux * L * s, y0 + uy * L * s];
      const tilt = (i ? 0.3 : -0.22) * L * 0.08; // 금이 능선과 비스듬히 만난다
      const jog = (i ? -1 : 1) * W * 0.12;
      held.push(...grab(() => bent([
        cx - nx * half * 1.1 - ux * tilt, cy - ny * half * 1.1 - uy * tilt,
        cx + ux * jog, cy + uy * jog,
        cx + nx * half * 1.15 + ux * tilt, cy + ny * half * 1.15 + uy * tilt,
      ], Math.max(1.6, W * 0.07), '', { life: 0.2, dry: 0.15, pr: 2, gr: 0.12 })));
    }
  });
  later(tc, () => {
    if (S.crack) {
      // 끝이 먼저 — 큰 결정 몸은 CUT까지로 줄고(밝은 면도), 끝 몫(같은 꼴 · 그 자리 굵기)이 따로 빨리 돌며 떨어진다
      for (const [p, s] of main) if (p.alive && p.seed === s) p.size *= CUT;
      const [cx, cy] = [x0 + ux * L * CUT, y0 + uy * L * CUT];
      fall(crystal(cx, cy, a0, L * (1 - CUT), W * (1 - CUT) ** 1.15, c, 0.3, S.face > 0), fs, 3, 0.3);
    }
    fall(main, fs, 1.3, 0.16);
    fall(held, fs, 1.4, 0.14);
    const [nb, nm, nd] = S.sh;
    const m = parts.length / 5;
    for (let i = 0; i < nb + nm + nd; i++) {
      const tier = i < nb ? 0 : i < nb + nm ? 1 : 2;
      const j = (tier === 0 ? 0 : i % m) * 5; // 큰 조각은 큰 결정에서
      const s = 0.3 + 0.6 * n01(); // 결정 3할 위에서만 — 뿌리 쪽 조각은 주인공 위로 떨어졌다
      const [rx, ry, tx, ty, w] = parts.slice(j, j + 5);
      const o = sgn() * w * 0.3 * (1 - s);
      shard(rx + (tx - rx) * s + nx * o, ry + (ty - ry) * s + ny * o, tier, W, fs, c, i);
    }
  });
}

/** 주인공 몸(레인 ±18 · 발 위 60)을 비킨 땅 뿌리 x — 왼쪽으로 기우니 오른쪽 뿌리는 기운 만큼 더 멀리 */
function clearBody(x: number, w: number, tilt: number): number {
  const P = VIEW.LANE_X[0];
  const lo = P - 22 - w / 2;
  const hi = P + 22 + w / 2 + 60 * Math.tan(tilt);
  if (x <= lo || x >= hi) return x;
  return x - lo < hi - x ? lo : hi;
}

/** 땅 결정 기둥 하나 — 땅 x에서 왼쪽 위로 기운 곧은 모서리 쐐기(높이 · 기울기는 차례마다 다르다), 얼어 서 있다가 쩍 → 끝이 먼저 떨어진다 */
function pillar(x: number, k: number, c: string): void {
  const [f, lean0] = PILLAR_AT[pillarN++ % PILLAR_AT.length];
  const H = 160 * k * f;
  const x0 = clearBody(x, H * PILLAR.W, lean0);
  const tilt = Math.min(lean0, Math.asin(Math.max(0, Math.min(1, (x0 - 12) / H)))); // 끝이 화면 왼쪽 밖으로 나가지 않게 세운다
  freeze(x0, G - 1, { ...PILLAR, L: H }, 1, c, UP - tilt, LEFT, false);
}

/** 친 방향 ang을 한쪽으로 기울인다 — 위쪽으로 더 가는 쪽. 하늘이면 왼쪽(오른쪽 아래 도장 반대) */
function lean(ang: number): number {
  const [a, b] = [ang - TILT, ang + TILT];
  if (Math.abs(Math.sin(a) - Math.sin(b)) < 0.05) return UP - TILT;
  return Math.sin(a) < Math.sin(b) ? a : b;
}
/** 진행 방향의 법선 중 위쪽 */
const normalUp = (ang: number): number => (Math.sin(ang - Math.PI / 2) > 0 ? ang + Math.PI / 2 : ang - Math.PI / 2);
const LEFT = -1;
const leftUp = (): number => UP - TILT + sgn() * 0.08;

export const icicle: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호에 가는 마른 획 한 줄 + 호 바깥으로 솟은 결정 셋(크기 · 간격 제각각, 칼끝 쪽으로 기운다)
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    bent(moonPts(m, 7), w * 0.34, '', { body: c, life, dry: 0.4, pr: 3, gr: 0.1 });
    const s = Math.max(0.7, w / 12);
    for (const [u, f] of [[0.42, 0.55], [0.71, 1], [0.97, 0.7]] as const) {
      const [x, y, ang, out] = moonPoint(m, u + sgn() * 0.04);
      const a = Math.atan2(Math.sin(out) + 0.55 * Math.sin(ang), Math.cos(out) + 0.55 * Math.cos(ang));
      const L = 16 * s * f * (0.85 + 0.3 * n01());
      crystal(x, y, a, L, L * 0.38, c, life * 0.9, f === 1);
    }
  },
  hit(x, y, k, c) {
    freeze(x, y, SIZE.hit, k, c, UP - TILT + SWAY[hitN++ % SWAY.length], LEFT);
  },
  floor(x, y, k, c) {
    freeze(x, y, SIZE.floor, k, c, leftUp(), LEFT);
  },
  destroy(x, y, k, c) {
    freeze(x, y, SIZE.destroy, k, c, leftUp(), LEFT);
  },
  whiff(x, y, c) {
    freeze(x, y, SIZE.whiff, 1, c, leftUp(), LEFT);
  },
  // 칼 기운 — 칼끝에서 날 중간까지 각진 결정 넷이 날 위쪽 옆(오른쪽 위) 한 대각으로 차례로 타고 오르고(칼끝이 가장 크다 · 큰 둘은 밝은 면),
  // 다섯째에 꼭대기 결정 끝에서 큰 조각 하나가 칼날 옆 공중으로 떨어져 나간다. 자리 · 각은 n으로만 정한다(겹쳐 그려도 떨리지 않게).
  // 서 있을 때 칼끝이 땅에 닿아도 결정은 위로 솟는다
  aura(b, n, c) {
    const p = n % 5;
    const f = [0.72, 0.82, 0.9, 1, 1][p];
    const [nx, ny] = upSide(Math.atan2(b[3] - b[1], b[2] - b[0])); // 날의 위쪽 옆
    let top: [number, number, number] | null = null;
    for (const [u, L, m, from] of AURA) {
      if (p < from) continue;
      const [x, y] = [b[0] + (b[2] - b[0]) * u + nx * 1.5, b[1] + (b[3] - b[1]) * u + ny * 1.5];
      const a = Math.atan2(ny * m - 1, nx * m); // 하늘과 날 위쪽 옆 사이
      crystal(x, y, a, L * f, L * f * 0.4, c, 0.3, L > 30);
      top = [x + Math.cos(a) * L * f, y + Math.sin(a) * L * f, nx < 0 ? -1 : 1];
    }
    if (p === 4 && top) shard(top[0], top[1], 0, 26, top[2], c, n);
  },
  every: 0.12,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 획 위쪽 옆에서 각진 결정(밝은 면) + 작은 결정이 뿌리 → 끝으로 차례로 박히고, 저마다 서 있다 쩍 기울며 떨어지고 조각 하나 · 둘 번갈아(k 1에서 ≤ 22).
    // 땅에서 솟는 획(천지개벽 벼락)이면 그 뿌리에 곧은 모서리 결정 기둥 하나(높이 · 기울기 제각각 · 모두 왼쪽 위)
    along(pts, k, c, dur) {
      if (pts[1] >= G - 3 && pts[pts.length - 1] < pts[1] - 200) {
        pillar(pts[0], k, c);
        return;
      }
      const n = Math.min(5, Math.max(2, Math.round(pathLen(pts) / 70)));
      follow(pts, 0, dur, n, (x, y, ang, u, i) => {
        const nu = normalUp(ang);
        const a = Math.atan2(Math.sin(nu) + 0.5 * Math.sin(ang), Math.cos(nu) + 0.5 * Math.cos(ang)); // 획이 나아가는 쪽으로 기운다
        const L = (24 + 16 * Math.sin(Math.PI * u)) * k * (0.85 + 0.3 * n01());
        const [nx, ny, turn] = upSide(a);
        const held = crystal(x, y, a, L, L * 0.34, c, 0.3, true);
        const [sx, sy] = [x - nx * L * 0.2 - Math.cos(a) * L * 0.05, y - ny * L * 0.2 - Math.sin(a) * L * 0.05];
        held.push(...crystal(sx, sy, a - turn * 0.25, L * (0.38 + 0.15 * n01()), L * 0.15, c, 0.3));
        const fs = Math.cos(a) < 0 ? -1 : 1;
        later(0.3 * 0.4, () => {
          fall(held, fs, 1, 0.2);
          for (let j = 0; j < 1 + (i % 2); j++) {
            const s = 0.2 + 0.6 * n01();
            shard(x + Math.cos(a) * L * s, y + Math.sin(a) * L * s, j ? 2 : 1, L * 0.34, fs, c, i + j);
          }
        });
      });
    },
    // 마무리 — 완파 덩이를 친 방향 ang에서 한쪽으로 기울여 그 자리에(조각은 기운 쪽으로). 오른쪽으로 기운 덩이는 더 세우고 작게 —
    // 좌우 한 쌍(십이연참 도장 양옆)이 같은 각으로 벌어지면 날개 편 새로 읽혔다(11-22 검수). 왼쪽 위 쏠림이 늘 이긴다.
    // 땅 자국(천지개벽 뿌리)이면 덩이 대신 주인공 양옆 땅 기둥 둘(몸을 덮지 않게)
    bloom(x, y, ang, k, c) {
      if (y >= G - 4) {
        pillar(x + 125, k, c);
        pillar(x - 150, k, c);
        return;
      }
      const a = lean(ang);
      const right = Math.cos(a) > 0;
      const a0 = right ? a - 0.55 : a;
      scaled(x, y, right ? k * 0.78 : k, () => freeze(x, y, SIZE.destroy, 1, c, a0, right ? 1 : -1, false));
    },
  },
};
