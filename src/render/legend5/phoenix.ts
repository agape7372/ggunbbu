// 자리 표시 — 2단계에서 원소 꼴로 바꾼다
// 불새 대검(불) 레시피. bladeFx RECIPES가 이 파일을 import해 이어 붙이기만 한다 — 2단계 담당은 이 파일만 고친다(다른 원소 파일 · bladeFx는 안 건드린다).
// 지금 = 공통 초승달 판: 칼길 swing = 몸을 두르는 초승달 한 획(trail) · hit = 친 자리 작은 초승달 · floor = 큰 초승달 · destroy = 앞뒤 두 겹 초승달 · whiff = 먹 초승달 · aura = 칼날에서 오르는 색 방울.
// 색 c = WEAPON_INK.phoenix. 몸 색(body)으로 그으면 legendTone이 저절로 먹 머리 → 짙은 색 → 순색 → 밝은 짝(WEAPON_LITE.phoenix)으로 칠한다.
// 2단계 꼴(설계서 §6): 초승달 끝이 위로 말려 솟는 불 혀 날개(끝이 가장 높다) → 속 빈 C자 불길 고리 → 불티 조각이 천천히 떨어짐. 보통 legendTone(먹 → 주황 → 밝은 노랑). 화염(빨강 밑동 → 먹 끝, 친 자리에서 솟는 혀)과 갈린다.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로 지운다) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ 이 파일은 bladeFx를 거쳐 불린다(순환 import). 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { drops, n01, sgn, sweep, trail, type Recipe } from '../bladeFx';

const UP = -Math.PI / 2;

/** 초승달 — (x, y)를 지나 ang 쪽으로 볼록한 호(반지름 r). 댄 머리가 굵고 꼬리가 가늘다(flick 누름) */
function crescent(x: number, y: number, r: number, ang: number, w: number, c: string, life: number): void {
  const cx = x - Math.cos(ang) * r * 0.6;
  const cy = y - Math.sin(ang) * r * 0.6;
  sweep(cx, cy, r, ang - 1.25 + sgn() * 0.1, 2.5, w, '', { body: c || undefined, life, dry: 0.3, pr: 1 }); // c '' = 먹
}

export const phoenix: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  swing(fx, fy, w, life, c, turn, grow) {
    trail(fx, fy, w * 1.2, '', { body: c, life, dry: 0.3 }, turn, grow);
  },
  hit(x, y, k, c) {
    crescent(x, y, 26 * k, UP + sgn() * 0.3, 5, c, 0.24);
  },
  floor(x, y, k, c) {
    crescent(x, y, 44 * k, UP + sgn() * 0.2, 7, c, 0.3);
  },
  destroy(x, y, k, c) {
    crescent(x, y, 70 * k, UP, 9, c, 0.36);
    crescent(x, y + 12, 86 * k, Math.PI / 2, 7, c, 0.34);
  },
  whiff(x, y) {
    crescent(x, y, 16, UP, 2.4, '', 0.14);
  },
  aura(b, n, c) {
    const u = 0.35 + n01() * 0.65;
    drops(b[0] + (b[2] - b[0]) * u, b[1] + (b[3] - b[1]) * u, 1, UP - 0.4, UP + 0.4, 20, 50, n % 3 === 2 ? 1.8 : 1.4, c, -260, true);
  },
  every: 0.12,
  tint: true,
};
