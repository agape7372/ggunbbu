// 해일 대검(물) 레시피 — 3판(설계서 DESIGN3 §2 「해일 대검」 줄). bladeFx RECIPES(surf)가 이어 붙이기만 한다.
// 꼴: 땅(발 높이)에서 일어나 친 쪽 앞으로 크게 말리는 파도 하나(둥근 갈고리). 굵은 물 몸은 등이 땅에서 완만히 솟아
// 마루에서 앞 → 아래 → 뒤로 감기는 나선이 된다. 말린 마루에서 흰 거품 줄이 둥근 갈퀴로 갈라진다. 마루는 하나다(톱니 · 지그재그 · MMM 금지).
// 박자: 일어남(4프레임, 몸이 등 → 말림 차례로 그어진다) → 앞으로 무너짐(6프레임, 마루가 앞 땅으로 내리꽂힌다) →
// 물방울이 포물선으로 튀고 땅엔 낮고 넓은 물 튐.
// 사건마다 꼴은 같고 크기만 다르다: aura < whiff < hit < floor < destroy · 필살 마무리 = destroy 꼴을 친 방향으로.
// 땅 파도(floor · destroy)의 굵은 몸은 주인공 둘레(좌우 ±22px) 바깥 앞쪽이고, 둘레엔 가늘게 들어가는 등 머리만 지난다.
// 다른 넷과 갈림: 불새 = 친 자리 위 V 날개 · 고압선 = 가로 꺾은선 · 고드름 = 앞 공중 비스듬한 가시 다발 · 그림자 = 땅 · 몸 뒤 먹 번짐.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW, WEAPON_FX } from '../../config';
import { bent, drops, later, n01, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, pathLen, swingMoon } from './geom';

type V = readonly [number, number];
const FOAM = PALETTE.BG; // 거품 = 밝은 짝 획 속에 남는 종이빛
const FWD = 1; // 땅 파도가 무너지는 쪽 — 칼이 끝나는 쪽(오른쪽)
const RISE = 4 / 60;
const FALL = 6 / 60;
const UP: V = [0, -1];
const RIGHT: V = [FWD, 0];

/** 진행 방향 ang의 법선 중 위쪽 */
const upOf = (ang: number): number => {
  const a = ang - Math.PI / 2;
  return Math.sin(a) > 0 ? a + Math.PI : a;
};
/** 위(U)를 세운 파도의 앞 — U를 90° 돌린 둘 중 want 쪽에 가까운 것 */
const fwdOf = (U: V, want: V): V => (-U[1] * want[0] + U[0] * want[1] >= 0 ? [-U[1], U[0]] : [U[1], -U[0]]);
/**
 * 땅 높이 — floor · destroy는 bladeReact가 scaled(친 자리, WEAPON_FX.SIZE) 안에서 부른다. 키운 뒤 땅에 닿을 자리를 미리 줄여 넣는다
 * (put은 획 머리만 땅 위로 잘라 올려서, 머리만 잘리면 같은 파도의 다른 획과 어긋난다)
 */
const groundIn = (y: number): number => y + (VIEW.GROUND_Y - 2 - y) / WEAPON_FX.SIZE;

/** 파도 한 꼴 — 몸 꺾은선(등 → 마루 → 나선) · 말림 중심 · 반지름 · 앞(F) · 위(U) · 무너져 닿는 자리 · 높이 */
interface Wave { pts: number[]; cx: number; cy: number; r: number; F: V; U: V; land: V; H: number }

/** 말림 위 t(0 = 마루 → 1 = 감긴 끝) 자리 — 앞 → 아래 → 뒤 → 위로 1.65π 돌고 반지름이 0.4배로 준다. add = 반지름에 더할 값 */
function onCurl(w: Wave, t: number, add = 0): [number, number, number, number, number, number] {
  const th = t * 1.65 * Math.PI;
  const rr = w.r * (1 - 0.6 * t) + add;
  const [c, s] = [Math.cos(th), Math.sin(th)];
  const ex = w.U[0] * c + w.F[0] * s; // 중심에서 바깥
  const ey = w.U[1] * c + w.F[1] * s;
  return [w.cx + ex * rr, w.cy + ey * rr, ex, ey, -w.U[0] * s + w.F[0] * c, -w.U[1] * s + w.F[1] * c]; // 자리 · 바깥 · 도는 쪽
}

/**
 * (ox, oy) = 파도 밑동(땅) · 앞 F · 위 U · 높이 H. 등은 −0.55H에서 가늘게 땅을 타다 가파르게 솟아 (0.3H, H) 마루,
 * 거기서 반지름 0.4H로 앞 → 아래 → 뒤로 감긴다. 무너지면 앞 1.0H 땅에 닿는다
 */
function waveAt(ox: number, oy: number, F: V, U: V, H: number): Wave {
  const at = (a: number, b: number): [number, number] => [ox + F[0] * a * H + U[0] * b * H, oy + F[1] * a * H + U[1] * b * H];
  const pts: number[] = [];
  for (let j = 0; j <= 7; j++) {
    const t = j / 7;
    pts.push(...at(-0.55 + 0.85 * t, Math.sin((t * Math.PI) / 2) ** 1.8));
  }
  const r = 0.4 * H;
  const [px, py] = at(0.3, 1);
  const w: Wave = { pts, cx: px - U[0] * r, cy: py - U[1] * r, r, F, U, land: at(1, 0), H };
  for (let j = 1; j <= 11; j++) pts.push(...onCurl(w, j / 11).slice(0, 2));
  return w;
}

/** 칼끝 말림 — 이미 있는 꺾은선 pts 끝(앞 F · 위 U)에서 같은 나선을 잇는다(칼길 · 칼 기운) */
function curlFrom(pts: number[], F: V, U: V, r: number): Wave {
  const [px, py] = [pts[pts.length - 2], pts[pts.length - 1]];
  const w: Wave = { pts, cx: px - U[0] * r, cy: py - U[1] * r, r, F, U, land: [px + F[0] * r * 2, py + F[1] * r * 2], H: r / 0.4 };
  for (let j = 1; j <= 8; j++) pts.push(...onCurl(w, j / 8).slice(0, 2));
  return w;
}

/** 물 몸 — 등 머리(먹)에서 가늘게 들어가 마루 쪽이 굵고 감긴 끝(밝은 짝)에서 빠진다. 4프레임에 다 일어나고 앞으로 밀린다 */
function body(w: Wave, width: number, life: number, c: string, push: number): void {
  bent(w.pts, width, '', { body: c, pr: 3, dry: 0.3, gr: Math.min(0.6, RISE / life), life, vx: w.F[0] * push, vy: w.F[1] * push });
}

/** 마루 거품 줄 — 말림 바깥을 따라 마루 → 앞 → 아래로 내려가는 밝은 짝 획(속 종이빛) */
function lipFoam(w: Wave, width: number, life: number, c: string): void {
  const pts: number[] = [];
  for (let j = 0; j <= 6; j++) pts.push(...onCurl(w, -0.08 + (0.5 * j) / 6, width * 0.55).slice(0, 2));
  bent(pts, width * 0.5, FOAM, { body: liteOf(c), pr: 1, dry: 0.25, gr: 0.3, hold: 0.8, life });
}

/** 말림 통 — 몸은 끝으로 가늘게 빠져 안쪽 감김이 안 보인다(둥근 문 꼴로 읽혔다). 마루 앞 → 감긴 끝을 고른 굵기로 한 번 더 눌러 갈고리를 세운다 */
function barrel(w: Wave, width: number, life: number, c: string): void {
  const pts: number[] = [];
  for (let j = 0; j <= 8; j++) pts.push(...onCurl(w, 0.2 + (0.8 * j) / 8).slice(0, 2));
  bent(pts, width * 0.62, '', { body: c, pr: 4, dry: 0.3, gr: 0.25, life, vx: w.F[0] * 20, vy: w.F[1] * 20 });
}

/** 거품 갈퀴 — 말린 마루 바깥에서 갈라져 나와 앞 · 아래로 둥글게 꺾이는 짧은 갈고리 n개(곧은 가시 · 톱니가 아니다) */
function fingers(w: Wave, n: number, width: number, life: number, c: string): void {
  for (let i = 0; i < n; i++) {
    const [x, y, ex, ey, tx, ty] = onCurl(w, -0.06 + 0.11 * i, width * 0.4); // 마루 꼭대기 → 조금 앞(앞으로 뻗으면 화면 밖)
    const L = w.r * (0.7 - 0.12 * i) * (0.85 + 0.3 * n01());
    const p = (e: number, t: number): number[] => [x + ex * L * e + tx * L * t, y + ey * L * e + ty * L * t];
    bent([x, y, ...p(0.5, 0.15), ...p(0.78, 0.5), ...p(0.72, 0.88), ...p(0.5, 1.12)], width * 0.42, FOAM, {
      body: liteOf(c), pr: 1, dry: 0.3, gr: 0.35, hold: 0.7, life: life * (0.8 + 0.25 * n01()), vx: w.F[0] * 30, vy: w.F[1] * 30,
    });
  }
}

/** 무너짐 — 말림 앞자리에서 앞으로 둥글게 넘어가 땅(land)에 내리꽂히는 한 붓(6프레임에 다 그어진다) */
function collapse(w: Wave, width: number, life: number, c: string): void {
  const [x0, y0] = onCurl(w, 1 / 3);
  const [x2, y2] = w.land;
  const [qx, qy] = [x0 + w.F[0] * w.H * 0.4 + w.U[0] * w.r * 0.2, y0 + w.F[1] * w.H * 0.4 + w.U[1] * w.r * 0.2];
  const pts: number[] = [];
  for (let j = 0; j <= 6; j++) {
    const t = j / 6;
    const [a, b, d] = [(1 - t) ** 2, 2 * t * (1 - t), t * t];
    pts.push(a * x0 + b * qx + d * x2, a * y0 + b * qy + d * y2);
  }
  bent(pts, width * 0.6, FOAM, { body: liteOf(c), pr: 1, dry: 0.3, gr: Math.min(0.6, FALL / life), hold: 0.75, life });
}

/** 물방울 — (x, y)에서 앞(F) · 위(U) 사이 부채로 튀어 포물선을 그리며 떨어진다. 시그니처 · 밝은 짝 반반(시그니처는 셋에 하나 꼴로 먹물) */
function spray(x: number, y: number, F: V, U: V, n: number, k: number, c: string, spd = 240): void {
  const ang = (al: number): number => Math.atan2(F[1] * Math.cos(al) + U[1] * Math.sin(al), F[0] * Math.cos(al) + U[0] * Math.sin(al));
  const a0 = ang(0.45);
  const a1 = a0 + Math.atan2(Math.sin(ang(1.3) - a0), Math.cos(ang(1.3) - a0));
  const half = Math.ceil(n / 2);
  drops(x, y, half, a0, a1, spd * 0.55 * k, spd * k, 2.6 * k, c, 900, true);
  if (n > half) drops(x, y, n - half, a0, a1, spd * 0.45 * k, spd * 0.85 * k, 2 * k, liteOf(c), 900, true);
}

/** 땅 물 튐 — 닿은 자리에서 땅을 따라 낮고 넓게 양옆으로 퍼지는 물 혀 둘(밝은 짝 + 거품 속) + 낮게 깔리는 방울 */
function splash(x: number, y: number, k: number, c: string, n: number): void {
  for (const d of [-1, 1]) {
    const L = (24 + 8 * n01()) * k * (d === FWD ? 1.2 : 0.8);
    bent([x + d * 4 * k, y, x + d * L * 0.55, y - L * 0.2, x + d * L, y - L * 0.08], 3.2 * k, FOAM, {
      body: liteOf(c), pr: 1, dry: 0.3, gr: 0.2, hold: 0.6, life: 0.3, vx: d * 40 * k,
    });
    drops(x + d * 6 * k, y - 2, Math.ceil(n / 2), d > 0 ? -0.7 : Math.PI + 0.35, d > 0 ? -0.35 : Math.PI + 0.7, 120 * k, 220 * k, 2 * k, c, 900, true);
  }
}

/**
 * 한 사건 — 일어남(몸) → 마루가 말리며 거품 줄 · 갈퀴(3프레임) → 앞으로 무너짐(4프레임) → 닿은 자리에서 물방울 · 땅 물 튐(10프레임).
 * ground = 땅 파도(닿은 자리에 물 튐). 크기는 H · width로만 다르다
 */
function surge(w: Wave, width: number, life: number, k: number, c: string, nf: number, sprays: number, ground: boolean): void {
  body(w, width, life, c, 28 * k);
  later(RISE * 0.75, () => {
    barrel(w, width, life * 0.85, c);
    lipFoam(w, width, life * 0.8, c);
    fingers(w, nf, width, life * 0.75, c);
  });
  later(RISE, () => collapse(w, width, life * 0.9, c));
  later(RISE + FALL, () => {
    spray(w.land[0], w.land[1] - 2, w.F, w.U, sprays, k, c);
    if (ground) splash(w.land[0], w.land[1], k, c, 4);
  });
}

/**
 * 땅 파도 — 등 머리가 주인공 발치(x − 10)에서 가늘게 시작해 앞으로 솟는다. 굵은 몸 · 마루는 둘레(±22px) 밖이고
 * 마루는 키운 뒤 주인공 앞 약 60px, 거품 갈퀴 끝까지 화면 폭 안(콤보 단이 커도 넘지 않게 k를 1.3에서 자른다)
 */
function groundWave(x: number, y: number, H: number): Wave {
  return waveAt(x + FWD * (0.55 * H - 10), groundIn(y), RIGHT, UP, H);
}

export const tide: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 물 몸으로 긋고 칼끝에서 그대로 파도 마루로 말려 감긴다(말림 바깥 거품 줄 · 갈퀴 하나) → 말린 끝에서 물방울
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.8, w / 12);
    const [, , ang, out] = moonPoint(m, 1);
    const U: V = [Math.cos(out), Math.sin(out)];
    const pts: number[] = [];
    for (let j = 0; j <= 8; j++) pts.push(...moonPoint(m, 0.35 + (0.65 * j) / 8).slice(0, 2)); // 칼길 앞 65%만 — 몸을 두르는 달이 아니라 칼끝 파도의 등
    const wv = curlFrom(pts, fwdOf(U, [Math.cos(ang), Math.sin(ang)]), U, 14 * s);
    bent(wv.pts, w * 1.1, '', { body: c, pr: 3, dry: 0.35, gr: 0.2, life: life * 0.85 });
    later(0.03, () => {
      barrel(wv, w * 0.9, life * 0.75, c);
      lipFoam(wv, w * 0.9, life * 0.7, c);
      fingers(wv, 1, w * 0.9, life * 0.6, c);
    });
    later(0.08, () => spray(wv.land[0], wv.land[1], wv.F, wv.U, 3, 0.8 * s, c));
  },
  // 타격 — 맞은 층 밑에서 작은 파도가 일어나 앞으로 말려 무너진다(물방울 셋)
  hit(x, y, k, c) {
    const H = 26 * Math.min(k, 1.5);
    surge(waveAt(x - FWD * 0.3 * H, y + 0.4 * H, RIGHT, UP, H), 6.5 * Math.min(k, 1.4), 0.3, k * 0.8, c, 1, 3, false);
  },
  // 층 깨기 — 발치에서 중간 파도가 솟아 앞 땅으로 무너진다 → 닿은 자리 물 튐
  floor(x, y, k, c) {
    const K = Math.min(k, 1.3);
    surge(groundWave(x, y, 36 * K), 9.5 * K, 0.36, K, c, 2, 4, true);
  },
  // 완파 — 가장 큰 파도 하나가 주인공 앞 땅에서 솟아 크게 말리고(갈퀴 셋) 앞으로 무너진다 → 물방울 많이 · 땅에 넓게 튐.
  // 주인공 높이에 가로로 몰리는 띠 · 몸을 두르는 고리 없음
  destroy(x, y, k, c) {
    const K = Math.min(k, 1.3);
    surge(groundWave(x, y, 50 * K), 13 * K, 0.44, K, c, 3, 6, true);
  },
  // 헛스윙 — 칼끝에서 가장 작은 파도 하나(말림까지) + 방울 둘
  whiff(x, y, c) {
    const w = waveAt(x - FWD * 4, y + 4, RIGHT, UP, 11);
    body(w, 3, 0.2, c, 20);
    later(RISE + 0.02, () => spray(w.land[0], w.land[1], RIGHT, UP, 2, 0.6, c, 200));
  },
  // 칼 기운 — 젖은 날: 날을 따라 방울이 떨어지고, 세 번에 한 번 날 위에 아주 작은 말림 하나가 선다
  aura(b, n, c) {
    const u = 0.35 + n01() * 0.65;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
    drops(x, y, 1, ang - 0.3, ang + 0.3, 30, 80, n % 2 ? 2.2 : 1.7, n % 2 ? liteOf(c) : c, 900, true);
    if (n % 3 === 0) {
      const U: V = [Math.cos(upOf(ang)), Math.sin(upOf(ang))];
      const F = fwdOf(U, [Math.cos(ang), Math.sin(ang)]);
      const w = curlFrom([x - F[0] * 6, y - F[1] * 6, x, y], F, U, 3.2);
      bent(w.pts, 2.2, '', { body: liteOf(c), pr: 3, dry: 0.25, gr: 0.3, life: 0.24, vx: F[0] * 20, vy: F[1] * 20 });
    }
  },
  every: 0.1,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 작은 파도가 차례로 일어나(획 진행 쪽으로 말림) 무너지고, 끝에서 물방울.
    // k 1에서 즉시 + later ≤ 파도 5 × 3 + 방울 3 × 2 = 21
    along(pts, k, c, dur) {
      const n = Math.min(5, Math.max(3, Math.round(pathLen(pts) / 70)));
      follow(pts, 0, dur, n, (x, y, ang, u) => {
        const U: V = [Math.cos(upOf(ang)), Math.sin(upOf(ang))];
        const H = (19 + 12 * u) * k;
        const w = waveAt(x, y, fwdOf(U, [Math.cos(ang), Math.sin(ang)]), U, H);
        body(w, 4.5 * k, 0.32, c, 24 * k);
        later(RISE * 0.75, () => fingers(w, 1, 4.5 * k, 0.24, c));
        later(RISE, () => collapse(w, 4.5 * k, 0.26, c));
      });
      follow(pts, dur * 0.5 + RISE + FALL, dur * 0.5, 3, (x, y, ang) => {
        const U: V = [Math.cos(upOf(ang)), Math.sin(upOf(ang))];
        spray(x, y, fwdOf(U, [Math.cos(ang), Math.sin(ang)]), U, 2, k, c);
      });
    },
    // 마무리 — 완파 꼴(큰 파도 하나)을 친 방향 ang으로 세운다: ang 쪽으로 솟아 오른쪽 돌림 앞으로 말려 무너진다
    bloom(x, y, ang, k, c) {
      const U: V = [Math.cos(ang), Math.sin(ang)];
      const F = fwdOf(U, Math.abs(U[0]) > 0.9 ? [0, 1] : RIGHT); // 가로로 치면 땅 쪽으로 무너진다
      const H = 52 * k;
      surge(waveAt(x - F[0] * 0.3 * H - U[0] * 0.5 * H, y - F[1] * 0.3 * H - U[1] * 0.5 * H, F, U, H), 10 * k, 0.44, k, c, 3, 6, false);
    },
  },
};
