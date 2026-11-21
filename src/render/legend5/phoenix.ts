// 불새 대검(불) 레시피 — 3판(설계서 DESIGN3 §2 「불새」 줄). bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 친 자리 위로 V자로 벌어지는 날개 한 쌍 — 곡선 깃 여러 장이 겹친 부채 둘, 깃 끝이 바깥 위로 말린다.
// 박자: 아래 깃 → 윗 깃 차례로 3프레임에 펼쳐짐 → 0.1초에 깃 끝이 아래로 한 번 접혔다 다시 펴짐(퍼덕).
// 흩어짐: 불티 · 깃 조각이 흔들리며 아래로 떨어진다(셋에 하나는 재 = 먹).
// 다른 넷과 갈린다: 해일 = 땅에서 앞으로 말린 파도 · 고압선 = 가로 꺾은선 · 고드름 = 한쪽 곧은 가시 다발 · 그림자 = 땅 먹 번짐.
// 화염(친 자리에서 줄지어 솟는 혀 왕관 · 오르는 불티)과도 갈린다: 이쪽은 가운데가 빈 V 날개 둘 · 떨어지는 불티.
// 공통 초승달(moonsFor · paintMoon)은 쓰지 않는다. 칼길만 swingMoon 기하를 따라 깃을 늘어세운다.
// 문법(불변 13): 깃 = 한 붓에 먹과 색(뿌리 먹 → 끝 주황 · 밝은 짝) · 알파 지우기 금지(꼬리부터 깎임) · 빛 모양 · 별 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE } from '../../config';
import { later, n01, put, sgn, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, pathLen, scatter, swingMoon } from './geom';

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;
/** 퍼덕 — 깃 끝이 아래로 접히는 각(라디안) */
const FOLD = 0.45;

interface Quill { life: number; bend: number; spin?: number; vy?: number; gr?: number }

/** 깃 하나 — (x, y) 깃뿌리에서 rot 쪽으로 L. bend = 휨(+ = 진행 방향의 시계 쪽으로 볼록). 뿌리 먹 → 끝 색(legendTone) */
function quill(x: number, y: number, rot: number, L: number, w: number, c: string, o: Quill): void {
  put('stroke', x, y, {
    life: o.life, size: L, rot, v: w, a: o.bend, c1: c, c2: '', dry: 0.26, pr: 5, gr: o.gr ?? 0.2, spin: o.spin ?? 0, vy: o.vy ?? 0,
  });
}

/**
 * 날개 한 쌍 — (x, y)에서 up 쪽으로 V자로 벌어지는 곡선 깃 부채 둘. R = 깃 길이 기준, n = 한쪽 깃 수(아래 깃 짧게 · 옆으로 → 윗 깃 길게 · 위로).
 * beat: 'flap' = 펼침(A, 아래 → 위 3프레임) + 0.1초에 접힌 채 다시 나와 펴짐(B) · 'one' = 펼침만 · 'open' = 접힌 채 나와 펴짐만
 */
function wings(x: number, y: number, R: number, n: number, c: string, life: number, beat: 'flap' | 'one' | 'open', up = UP): void {
  const [ux, uy] = [Math.cos(up), Math.sin(up)];
  for (const s of [-1, 1]) {
    const [sx, sy] = [Math.cos(up + (s * Math.PI) / 2), Math.sin(up + (s * Math.PI) / 2)];
    for (let j = 0; j < n; j++) {
      const t = n === 1 ? 1 : j / (n - 1);
      const rot = up + s * (Math.PI / 2 - (0.14 + 1.04 * t)); // 아래 깃 = 거의 옆 · 윗 깃 = 60° 위
      const L = R * (0.55 + 0.5 * t) * (0.92 + 0.16 * n01());
      const w = R * (0.13 + 0.06 * t);
      const bend = s * L * (0.12 + 0.16 * t); // 바깥 아래로 볼록 — 끝이 바깥 위로 말린다(윗 깃이 가장 많이)
      // 뿌리 — 친 자리보다 조금 위, 가운데를 비우고(V 골) 아래 깃일수록 바깥 · 아래(한 점에서 퍼지는 빛살로 안 읽히게)
      const off = R * (0.09 + 0.15 * (1 - t));
      const lift = R * (0.18 - 0.08 * (1 - t));
      const rx = x + sx * off + ux * lift;
      const ry = y + sy * off + uy * lift;
      if (beat !== 'open') later((t * 2) / 60, () => quill(rx, ry, rot, L, w, c, { life: beat === 'flap' ? life * 0.55 : life, bend }));
      if (beat !== 'one') {
        later(beat === 'flap' ? 0.1 : (t * 2) / 60, () => quill(rx, ry, rot + s * FOLD, L, w, c, {
          life, bend, spin: (-s * FOLD) / (life * 0.7), vy: -R * 0.5, gr: 0.14,
        }));
      }
    }
  }
}

/** 불티 — 찢긴 다섯 귀 조각이 살짝 튀었다 흔들리며 떨어진다. 시그니처 · 밝은 짝 · 재(먹) 번갈아. 철거칼 금박(3.8~7.2)보다 크다 */
function ember(x: number, y: number, k: number, c: string, i: number): void {
  const q = Math.sqrt(k);
  put('leaf', x, y, {
    vx: sgn() * 36 * q, vy: (-30 - n01() * 50) * q, g: 240 * q, drag: 1.5,
    life: 0.85 + n01() * 0.4, size: (4.2 + n01() * 2.8) * q, rot: n01() * TAU, spin: sgn() * 5,
    c1: i % 3 === 0 ? PALETTE.INK : i % 3 === 1 ? liteOf(c) : c,
  });
}

/** 깃 조각 — 짧은 곡선 깃 하나가 빙글 돌며 천천히 떨어진다(먹 뿌리 → 주황 끝) */
function plume(x: number, y: number, k: number, c: string): void {
  const q = Math.sqrt(k);
  put('stroke', x, y, {
    life: 0.75 + n01() * 0.3, size: (11 + n01() * 6) * q, rot: n01() * TAU, v: 3.4 * q, a: 3 * q * (sgn() > 0 ? 1 : -1),
    c1: c, c2: '', dry: 0.3, pr: 0, gr: 0.12, vx: sgn() * 40 * q, vy: -40 * q, g: 170 * q, drag: 1.6, spin: sgn() * 4,
  });
}

/** 한 사건 — 날개 펼침 · 퍼덕 → 날개 자리에서 불티 · 깃 조각이 떨어진다. 개수는 k와 무관(상한 고정), 크기만 √k */
function bird(x: number, y: number, R: number, n: number, k: number, c: string, life: number, embers: number, plumes: number, up = UP): void {
  wings(x, y, R, n, c, life, 'flap', up);
  const [ux, uy] = [Math.cos(up), Math.sin(up)];
  const at = (i: number): [number, number] => {
    const s = i % 2 ? 1 : -1;
    const a = 0.2 + 0.7 * n01();
    const b = 0.25 + 0.6 * n01();
    return [x - uy * s * R * a + ux * R * b, y + ux * s * R * a + uy * R * b];
  };
  scatter(0.14, embers, (i) => { const [ex, ey] = at(i); ember(ex, ey, k, c, i); }, 12);
  for (let i = 0; i < plumes; i++) later(0.16 + i * 0.04, () => { const [px, py] = at(i); plume(px, py, k, c); });
}

/** 크기 기준 — 콤보 단 k를 √로(1.8단에 날개가 화면을 넘지 않게) */
const size = (base: number, k: number): number => base * Math.sqrt(k);

export const phoenix: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 따라 곡선 깃이 바깥 · 뒤로 젖혀 늘어선다(꼬리 → 칼끝 차례로, 칼끝 쪽 깃이 길다)
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.8, w / 12);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const u = 0.12 + (0.88 * i) / (n - 1);
      later(u * 0.03, () => {
        const [x, y, ang, out] = moonPoint(m, u);
        const rot = Math.atan2(Math.sin(out) - 0.7 * Math.sin(ang), Math.cos(out) - 0.7 * Math.cos(ang));
        const L = (12 + 18 * u) * s;
        quill(x, y, rot, L, (2.4 + 2.8 * u) * s, c, { life: life * (0.8 + 0.3 * u), bend: Math.sign(Math.sin(ang - rot)) * L * 0.22, gr: 0.25 });
      });
    }
  },
  hit(x, y, k, c) {
    bird(x, y, size(28, k), 3, k, c, 0.3, 4, 2);
  },
  floor(x, y, k, c) {
    bird(x, y, size(40, k), 4, k, c, 0.34, 8, 3);
  },
  // 완파 — 머리 위로 가장 큰 날개(한쪽 다섯 깃) → 불티 · 깃 조각이 가장 많이
  destroy(x, y, k, c) {
    bird(x, y, size(50, k), 5, k, c, 0.38, 14, 5);
  },
  // 헛스윙 — 가장 작은 V 깃 둘씩(펼침만)
  whiff(x, y, c) {
    wings(x, y, 12, 2, c, 0.18, 'one');
  },
  // 칼 기운 — 날에서 깃 조각이 하나씩 떨어져 흔들리며 내린다 · 세 번에 한 번 불티
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.65;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    plume(x, y, 0.7, c);
    if (n % 3 === 0) ember(x, y, 0.8, c, n / 3);
  },
  every: 0.11,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 작은 날개 쌍이 접힌 채 나와 펴지고, 다 편 뒤 불티 · 깃 조각 여덟이 떨어진다(k 1에서 즉시 + later ≤ 20)
    along(pts, k, c, dur) {
      const n = Math.min(3, Math.max(1, Math.round(pathLen(pts) / 140)));
      follow(pts, 0, dur, n, (x, y) => wings(x, y, size(36, k), 2, c, 0.4, 'open'));
      follow(pts, dur + 0.04, 0.16, 8, (x, y, _a, _u, i) => (i % 4 === 3 ? plume(x, y - 10, k, c) : ember(x + sgn() * 10, y - 10, k * 1.3, c, i)));
    },
    // 마무리 — 완파 꼴(한쪽 다섯 깃)을 친 방향 ang으로 펼친다
    bloom(x, y, ang, k, c) {
      bird(x, y, size(64, k), 5, k * 1.3, c, 0.42, 16, 5, ang);
    },
  },
};
