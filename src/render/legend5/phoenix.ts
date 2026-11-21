// 불새 대검(불) 레시피 — 4판(방향표 「불새」 줄). bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 친 자리에서 위로 솟는 불기둥(넓은 붓 면) → 기둥 허리에서 비대칭 두 날개(한쪽은 위로 길게 · 한쪽은 옆으로 짧게).
//   날개 = 뼈 한 획 + 그 밑에 매달린 깃(마른 붓 획, 길이 · 각 · 끝 갈라짐이 제각각 — 붓으로 그린 불새 깃).
// 박자: 기둥 3프레임 → 날개 2프레임 늦게 펼침 → 퍼덕(접힌 깃이 다시 펴짐) → 불 혀가 위로 떨어져 나간다.
// 흩어짐: 불티 · 재(먹)가 흔들리며 위로 뜬다. 날개 밑엔 검은 재 조각이 섞인다.
// 다른 넷과 갈린다: 해일 = 옆으로 말린 큰 면 · 고압선 = 공중 가는 선 · 고드름 = 각진 덩이 · 그림자 = 땅에서 솟은 가는 선 다발.
// 화염(친 자리에서 줄지어 솟는 혀 왕관)과도 갈린다: 이쪽은 기둥 하나에 한쪽으로 쏠린 날개, 혀는 떨어져 나가 떠오른다.
// 문법(불변 13): 한 붓에 먹과 색(뿌리 먹 → 끝 주황 · 밝은 짝) · 알파 지우기 금지(꼬리부터 깎임) · 빛 모양 · 별 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE } from '../../config';
import { bent, later, n01, put, sgn, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, pathLen, scatter, swingMoon } from './geom';

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;
/** 퍼덕 — 깃이 아래로 접혔다 펴지는 각(라디안) */
const FOLD = 0.42;

/** 붓 누름 번호(bladeFx PRESSES) — 0 = 가늘게 들어가 앞 3할이 가장 굵고 뾰족하게 빠진다(먹 뿌리가 덩이로 안 남는다) · 5 = 눌러 대고 고르게 가다 끝이 갈라진다 */
const CUT = 0;
const BRUSH = 5;

interface Lick { life: number; sway: number; dry?: number; pr?: number; gr?: number; vx?: number; vy?: number }

/** 불 혀 — 밑동 (x, y)에서 ang 쪽으로 L, 한 번 S자로 휘었다 끝이 반대로 말린다(일곱 점 한 붓). sway = 휨 폭(± = 쪽) */
function lick(x: number, y: number, ang: number, L: number, w: number, c: string, o: Lick): void {
  const [ca, sa] = [Math.cos(ang), Math.sin(ang)];
  const pts: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const off = o.sway * Math.sin(Math.PI * 1.3 * t) * (0.5 + t) / 1.5;
    pts.push(x + ca * L * t - sa * off, y + sa * L * t + ca * off);
  }
  bent(pts, w, '', { body: c, life: o.life, dry: o.dry ?? 0.4, pr: o.pr ?? CUT, gr: o.gr ?? 0.16, vx: o.vx, vy: o.vy });
}

interface Quill { life: number; bend: number; dry?: number; pr?: number; gr?: number; spin?: number; vy?: number }

/** 깃 하나 — 뿌리 (x, y)에서 rot 쪽으로 L. bend = 휨(+ = 진행 방향 오른쪽으로 볼록). 뿌리 먹 → 끝 색(legendTone) */
function quill(x: number, y: number, rot: number, L: number, w: number, c: string, o: Quill): void {
  put('stroke', x, y, {
    life: o.life, size: L, rot, v: w, a: o.bend, c1: c, c2: '', dry: o.dry ?? 0.4, pr: o.pr ?? CUT, gr: o.gr ?? 0.2, spin: o.spin ?? 0, vy: o.vy ?? 0,
  });
}

/** 틀 — (x, y) 친 자리, up = 위 쪽 각. 로컬 (a = 위로, b = s 쪽 옆으로) → 월드 · 로컬 각(위에서 옆으로 th) → 월드 각 */
interface Frame { at(a: number, b: number): [number, number]; dir(th: number): number }
function frame(x: number, y: number, up: number): Frame {
  const [ux, uy] = [Math.cos(up), Math.sin(up)];
  return { at: (a, b) => [x + ux * a - uy * b, y + uy * a + ux * b], dir: (th) => up + th };
}

/**
 * 날개 하나 — 어깨 (a0, b0)에서 뼈가 위에서 s 쪽으로 th 기운 채 len만큼, 그 밑에 깃 n장이 매달린다.
 * 깃은 어깨 쪽이 짧고 바깥으로 눕고(둘째 깃) 끝 쪽이 길고 뼈를 따라 뻗는다(첫째 깃). 자리 · 길이 · 각 · 굵기 · 마름이 깃마다 다르다.
 * flap = 퍼덕 — 0.16초 뒤 같은 깃이 FOLD만큼 접힌 채 다시 나와 위로 펴진다(뼈는 그대로 산다)
 */
function wing(f: Frame, s: number, a0: number, b0: number, th: number, len: number, n: number, c: string, life: number, flap: boolean): [number, number] {
  const bone = f.dir(s * th);
  const [sx, sy] = f.at(a0, s * b0);
  const tipX = sx + Math.cos(bone) * len;
  const tipY = sy + Math.sin(bone) * len;
  // 뼈 — 어깨에서 가늘게 들어가 앞 3할이 가장 굵고 끝으로 빠지는 휜 획(바깥 위로 볼록)
  quill(sx, sy, bone, len, len * 0.16, c, { life: life * 1.4, bend: -s * len * 0.12, dry: 0.3, pr: CUT, gr: 0.1 });
  for (let j = 0; j < n; j++) {
    const t = Math.min(1, (j + 0.6 + 0.5 * n01()) / n); // 깃 사이 간격이 고르지 않게
    const rx = sx + (tipX - sx) * t;
    const ry = sy + (tipY - sy) * t;
    // 뼈에서 바깥 아래로 눕는 각 — 어깨 쪽일수록 많이. 많이 처지면 야자수로 읽혀 끝 쪽은 뼈를 따라 뻗는다
    const lay = Math.min(1.05, 0.06 + 0.7 * (1 - t) ** 1.2 + 0.12 * n01());
    const rot = f.dir(s * (th + lay));
    // 끝 두 깃은 굵기 · 길이를 갈라 놓는다 — 맨 끝은 가늘고 길게 마른 붓으로 갈라지고 그 앞은 짧고 굵다(같은 꼴 먹 덩이 둘이 나란히 서면 블록으로 읽혔다)
    const end = j === n - 1 ? 1 : j === n - 2 ? 2 : 0;
    const L = len * (0.34 + 0.55 * t ** 1.3) * (0.75 + 0.5 * n01()) * (end === 1 ? 1.15 : end === 2 ? 0.78 : 1);
    const w = len * (0.1 + 0.06 * t) * (0.8 + 0.4 * n01()) * (end === 1 ? 0.45 : 1);
    const q: Quill = { life, bend: s * L * (0.1 + 0.14 * n01()), dry: end === 1 ? 0.78 : 0.32 + 0.3 * n01(), pr: CUT };
    const beat = flap && j >= n / 2; // 퍼덕은 바깥 반(첫째 깃)만 — 다 접었다 펴면 덤불로 읽힌다
    // 깃은 어깨부터 한 프레임에 하나씩 — 한꺼번에 나오면 펼침 첫 프레임들이 덤불로 읽혔다(뼈가 먼저, 깃은 그다음 프레임부터)
    const at = (j + 0.9) / 60;
    later(at, () => quill(rx, ry, rot, L, w, c, beat ? { ...q, life: life * 0.55 } : q));
    if (beat) later(0.16 + at, () => quill(rx, ry, rot + s * FOLD, L * 0.95, w, c, { ...q, spin: (-s * FOLD * 1.3) / life, gr: 0.12 }));
  }
  return [tipX, tipY];
}

/** 불티 · 재 — 찢긴 조각이 흔들리며 위로 뜬다(leaf가 좌우로 흔든다). ash = 먹 재(조금 크다) */
function ember(x: number, y: number, q: number, c: string, i: number, ash = false): void {
  put('leaf', x, y, {
    vx: sgn() * 40 * q, vy: (-50 - n01() * 80) * q, g: -50 * q, drag: 1.4,
    life: 0.8 + n01() * 0.5, size: (ash ? 4.6 : 3.4) * q * (0.8 + 0.6 * n01()), rot: n01() * TAU, spin: sgn() * 4,
    c1: ash ? PALETTE.INK : i % 2 ? liteOf(c) : c,
  });
}

/**
 * 불새 한 마리 — (x, y)에서 up 쪽으로. H = 기둥 높이(로컬). wings = 날개마다 깃 수 [긴 날개, 짧은 날개] · flap = 퍼덕 ·
 * tongues = 떨어져 나가는 불 혀 수 · embers = 불티 수(셋에 하나는 재). 개수는 k와 무관(상한 고정), 크기만 q
 */
function bird(x: number, y: number, H: number, wings: readonly [number, number], flap: boolean, tongues: number, embers: number, c: string, up = UP): void {
  const f = frame(x, y, up);
  const s = sgn() > 0 ? 1 : -1; // 긴 날개 쪽
  const life = 0.42;
  // 기둥 — 넓은 붓 면 하나가 3프레임에 솟고(뿌리 먹 → 꼭대기 주황), 곁에 가는 혀 한 가닥이 반대로 꼬며 따라 오른다
  const [bx, by] = f.at(4, 0); // 뿌리는 친 자리보다 조금 위 — 맞은 층 밑변은 주인공 머리 높이다
  lick(bx, by, f.dir(s * 0.06), H, H * 0.2, c, { life: life * 1.2, sway: -s * H * 0.1, pr: CUT, dry: 0.36, gr: 0.1, vy: -30 });
  later(0.02, () => {
    const [px, py] = f.at(H * 0.1, -s * H * 0.06);
    lick(px, py, f.dir(-s * 0.1), H * 0.78, H * 0.07, c, { life: life * 1.1, sway: s * H * 0.12, dry: 0.5, gr: 0.14, vy: -40 });
  });
  // 머리 깃 — 기둥 꼭대기에서 두 갈래로 갈라져 솟는 짧은 혀(길이 · 기울기 다르게). 몸통이 새 머리로 서야 나무 · 덤불로 안 읽힌다
  later(0.05, () => {
    const [hx, hy] = f.at(H * 0.86, -s * H * 0.04);
    lick(hx, hy, f.dir(-s * 0.35), H * 0.3, H * 0.06, c, { life, sway: s * H * 0.05, gr: 0.18, vy: -50 });
    lick(hx, hy, f.dir(s * 0.12), H * 0.2, H * 0.045, liteOf(c), { life: life * 0.9, sway: -s * H * 0.04, gr: 0.2, vy: -60 });
  });
  // 날개 — 기둥 허리(5할)에서 2프레임 늦게. 긴 쪽은 위로 30° · 짧은 쪽은 옆으로 65°(한 프레임 더 늦게 — 두 날개 깃이 같은 프레임에 겹쳐 나오지 않게)
  const tips: [number, number][] = [];
  later(0.085, () => { tips[0] = wing(f, s, H * 0.5, H * 0.03, 0.52, H * 0.62, wings[0], c, life, flap); });
  later(0.085 + 1 / 60, () => { tips[1] = wing(f, -s, H * 0.44, H * 0.04, 1.12, H * 0.4, wings[1], c, life * 0.9, flap); });
  // 불 혀 — 날개 끝 · 기둥 꼭대기에서 떨어져 나가 S자로 꼬며 위로 떠오른다
  for (let i = 0; i < tongues; i++) {
    later(0.24 + 0.05 * i + 0.03 * n01(), () => {
      const [tx, ty] = i < 2 && tips[i] ? tips[i] : f.at(H * (0.9 + 0.1 * n01()), sgn() * H * 0.12);
      const L = H * (0.2 + 0.12 * n01());
      lick(tx, ty, f.dir(sgn() * 0.3), L, H * 0.05, i % 2 ? liteOf(c) : c, { life: 0.4, sway: sgn() * L * 0.25, gr: 0.22, vx: sgn() * 30, vy: -150 - n01() * 60 });
    });
  }
  // 불티 · 재 — 날개 자리(긴 쪽이 많이)에서, 재는 날개 밑에서
  const q = H / 100;
  scatter(0.12, embers, (i) => {
    const side = i % 3 === 2 ? -s : s;
    const [ex, ey] = f.at(H * (0.35 + 0.6 * n01()), side * H * (0.1 + 0.4 * n01()));
    ember(ex, ey, Math.sqrt(q), c, i, i % 3 === 0);
  }, 14);
}

/** 크기 기준 — 콤보 단 k를 √로(1.5단에서 멈춘다 — 완파 날개가 화면 폭 360을 넘지 않게) */
const size = (base: number, k: number): number => base * Math.sqrt(Math.min(k, 1.5));

export const phoenix: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호 위에 짧은 불 혀들이 위로 서서 타오른다(띠로 감지 않는다). 자리 · 길이 · 기울기가 제각각
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.8, w / 12);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const u = Math.min(1, 0.08 + (0.9 * (i + 0.3 * n01())) / (n - 1));
      later(u * 0.035, () => {
        const [x, y] = moonPoint(m, u);
        const L = (16 + 26 * u ** 1.2) * s * (0.7 + 0.6 * n01());
        lick(x, y, UP + sgn() * 0.25, L, (3.4 + 3 * u) * s, i === 2 ? liteOf(c) : c, { life: life * (0.8 + 0.4 * n01()), sway: sgn() * L * 0.22, vy: -50 });
      });
    }
  },
  // 타격 — 친 자리 위로 솟는 불길(외곽이 위로 좁아지는 세모): 밑변에 뿌리를 옆으로 벌린 혀 넷(가운데가 가장 길다)이 위로 서고,
  // 가운데 혀 끝은 두 갈래 밝은 혀로 갈라져 솟는다. 뿌리를 한 점에 모으고 위를 벌리면 거꾸로 매달린 다발로 읽혔다.
  // 몸은 첫 프레임에 다 그어(gr) 먹 뿌리만 검은 덩이로 남는 프레임이 없다. 곁 혀는 가운데 혀 밑동을 감싸 한 불길로 붙고(따로 서면 방추 셋으로 읽혔다),
  // 먹 머리는 가운데 혀와 바깥 짧은 혀 하나뿐 — 감싸는 혀는 밝은 짝이라 먹 밑동이 덩이로 커지지 않는다
  hit(x, y, k, c) {
    const H = size(120, k);
    const f = frame(x, y, UP);
    const s = sgn() > 0 ? 1 : -1;
    const [rx, ry] = f.at(10, 0); // 뿌리는 친 자리보다 10 위 — 맞은 층 밑변은 주인공 머리 높이다
    // 가운데 혀는 7할 남짓만 — 먹 밑동 길이가 혀 길이를 따라 는다. 나머지 키는 먹 없는 갈라진 끝이 잇는다
    lick(rx, ry, f.dir(s * 0.04), H * 0.72, H * 0.14, c, { life: 0.36, sway: -s * H * 0.08, dry: 0.45, gr: 0.045, vy: -40 });
    // 곁 혀 [밑동 벌림, 기울기, 길이, 굵기, 밝은 짝] — 한쪽에 둘 · 다른 쪽에 하나(좌우가 다르다). 바깥으로 휘었다 끝이 안으로 말려 외곽이 위로 좁아진다
    const B: readonly [number, number, number, number, boolean][] = [
      [s * 0.08, s * 0.14, 0.62, 0.12, true], [s * 0.2, s * 0.3, 0.3, 0.08, false], [-s * 0.09, -s * 0.12, 0.48, 0.1, true],
    ];
    B.forEach(([b, tilt, len, w, lite], i) => later((i + 0.9) / 60, () => {
      const [px, py] = f.at(12 + 8 * n01(), b * H);
      const L = H * len * (0.85 + 0.3 * n01());
      lick(px, py, f.dir(tilt), L, H * w, lite ? liteOf(c) : c, { life: 0.32, sway: Math.sign(b) * L * (0.18 + 0.1 * n01()), dry: 0.45, gr: 0.1, vy: -55 });
    }));
    // 갈라진 끝 — 가운데 혀 8할 자리에서 두 갈래 밝은 혀가 벌어져 솟는다(길이 · 굵기가 다르다)
    later(1.9 / 60, () => {
      const [px, py] = f.at(10 + H * 0.58, s * H * 0.04);
      lick(px, py, f.dir(s * 0.22), H * 0.44, H * 0.075, liteOf(c), { life: 0.3, sway: -s * H * 0.06, dry: 0.45, gr: 0.16, vy: -70 });
      lick(px, py, f.dir(-s * 0.2), H * 0.28, H * 0.05, liteOf(c), { life: 0.26, sway: s * H * 0.05, gr: 0.18, vy: -80 });
    });
    // 떨어져 나가는 혀 — 꼭대기에서 끊겨 위로 뜬다
    later(0.16, () => {
      const [tx, ty] = f.at(H * 0.95, s * H * 0.06);
      lick(tx, ty, f.dir(sgn() * 0.3), H * 0.2, H * 0.05, liteOf(c), { life: 0.32, sway: sgn() * H * 0.06, gr: 0.22, vy: -160 });
    });
    scatter(0.08, 4, (i) => { const [ex, ey] = f.at(H * (0.3 + 0.5 * n01()), sgn() * H * 0.3); ember(ex, ey, Math.sqrt(k), c, i, i === 3); }, 10);
  },
  // 층 깨기 — 완파의 6할: 기둥 + 작은 두 날개(퍼덕 없음) + 불 혀 셋
  floor(x, y, k, c) {
    bird(x, y, size(80, k), [4, 3], false, 3, 7, c);
  },
  // 완파 — 건물 위로 가장 큰 불새: 기둥 → 비대칭 두 날개 → 퍼덕 → 불 혀 넷이 떨어져 나가고 불티 · 재가 오른다
  destroy(x, y, k, c) {
    bird(x, y, size(120, k), [6, 4], true, 4, 9, c);
  },
  // 헛스윙 — 칼끝에서 작은 불 혀 둘이 말려 오른다
  whiff(x, y, c) {
    lick(x, y, UP + 0.2, 24, 4.4, c, { life: 0.22, sway: 6, vy: -50 });
    lick(x - 5, y + 3, UP - 0.35, 15, 3, liteOf(c), { life: 0.2, sway: -4, vy: -60 });
  },
  // 칼 기운 — 칼날 바깥 반에서 칼날보다 긴 불 혀가 위로 말려 오른다(한 번에 둘 · 셋이 살아 있다). 깜빡임은 고르지 않게 건너뛴다.
  // 혀는 몸 바깥으로 휘었다 끝만 안으로 말린다 — 길어져도 머리 · 몸을 덮지 않게.
  // cr = 콤보 비율(0~1) — 콤보가 쌓일수록 혀가 길어진다(불새 = 콤보가 쌓일수록 사거리가 는다)
  aura(b, n, c, cr = 0) {
    if (n01() < 0.18) return;
    const u = 0.45 + n01() * 0.55;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const out = b[2] >= b[0] ? 1 : -1; // 몸 바깥 쪽
    const L = (60 + 20 * n01()) * (1 + 1.1 * cr); // 콤보 100에서 2.1배 — 2.4배는 혀가 180을 넘어 먹 줄기만 길게 남았다
    lick(x, y, UP + out * (0.1 + 0.3 * n01()), L, 7.8 + 2.4 * cr, n % 3 === 2 ? liteOf(c) : c, { life: 0.3 + 0.22 * n01(), sway: L * (out * 0.18 + sgn() * 0.1), vy: -40 - 30 * cr });
    if (n % 3 === 0) { // 셋에 하나는 곁에 짧은 혀 하나 더 — 한 번에 둘 · 셋이 겹쳐 탄다
      const v = 0.3 + n01() * 0.5;
      lick(b[0] + (b[2] - b[0]) * v, b[1] + (b[3] - b[1]) * v, UP + out * 0.05, L * 0.6, 5.4 + 1.5 * cr, c, { life: 0.26 + 0.14 * n01(), sway: L * (out * 0.14 + sgn() * 0.06), vy: -50 - 30 * cr });
    }
    if (n % 4 === 0) ember(x, y - 4, 0.7 + 0.3 * cr, c, n, n % 8 === 0);
  },
  every: 0.1,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 불 혀가 차례로 위로 솟고(가운데가 길다), 셋에 하나 곁에 밝은 혀 · 불티(k 1에서 ≤ 20)
    along(pts, k, c, dur) {
      const n = Math.min(6, Math.max(2, Math.round(pathLen(pts) / 80)));
      const q = Math.sqrt(k);
      follow(pts, 0, dur, n, (x, y, _a, u, i) => {
        const L = (34 + 30 * Math.sin(Math.PI * u)) * q * (0.8 + 0.4 * n01());
        lick(x, y, UP + sgn() * 0.22, L, 7 * q, c, { life: 0.4, sway: sgn() * L * 0.25, pr: BRUSH, gr: 0.14, vy: -50 });
        if (i % 3 === 1) later(0.05, () => lick(x + sgn() * 6, y - 6, UP + sgn() * 0.5, L * 0.5, 3.6 * q, liteOf(c), { life: 0.36, sway: sgn() * L * 0.12, vy: -120 }));
        ember(x + sgn() * 10, y - 12, q, c, i, i % 3 === 0);
      });
    },
    // 마무리 — 완파 꼴(기둥 → 비대칭 날개 → 퍼덕)을 친 방향 쪽으로 조금 기울여
    bloom(x, y, ang, k, c) {
      bird(x, y, size(120, k), [6, 4], true, 4, 9, c, UP + 0.35 * Math.cos(ang));
    },
  },
};
