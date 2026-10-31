// 마스크 — 사용자가 도트판에 찍은 16×16 그림. 저장은 문자열 하나(save.maskArt).
// 새 판 = `m2:` 뒤에 칸마다 `.`(빈칸) 또는 색 여섯 자리(16진 소문자). 「색 만들기」로 만든 색도 그대로 담는다.
// 옛 판 = 256자, 칸마다 옛 팔레트 번호 한 글자(0 빈칸 · 1~c). 견본과 옛 저장을 읽을 때만 쓴다.
// DOM/캔버스 없음. 그리기는 render/maskArt.ts, 도트판 화면은 ui/maskEditor.ts.

export const MASK_N = 16;
export const MASK_CELLS = MASK_N * MASK_N;

/** 옛 판 팔레트 — 번호 1~12, 0은 빈칸. ★순서 = 옛 그림 문자열의 뜻이라 바꾸지 않는다(견본도 이걸로 읽는다) */
export const MASK_PALETTE: readonly string[] = [
  '',        // 0 빈칸
  '#1A1A20', // 1 잉크
  '#FFFFFF', // 2 흰색
  '#9A958C', // 3 회색
  '#E5302E', // 4 빨강
  '#F08A1C', // 5 주황
  '#FFD200', // 6 노랑
  '#2E9E4F', // 7 초록
  '#1E62D0', // 8 파랑
  '#7A44B8', // 9 보라
  '#F07AA0', // a 분홍
  '#E8B48A', // b 살구
  '#8A5A34', // c 갈색
];

/**
 * 도트판 기본 색 30 — 여섯 칸 다섯 줄(무채색 · 옅은 · 사이 · 또렷한 · 진한). 위아래로 같은 색 계열, 옛 팔레트 열둘을 다 품는다.
 * 그림엔 색 자체가 저장되니 여기 순서·구성은 바꿔도 된다. 형광 없음
 */
export const MASK_SWATCHES: readonly (readonly [hex: string, name: string])[] = [
  ['#ffffff', '흰색'], ['#d2cec6', '밝은 회색'], ['#9a958c', '회색'], ['#5a5852', '짙은 회색'], ['#1a1a20', '잉크'], ['#4a2e1a', '고동색'],
  ['#ffc9d6', '연분홍'], ['#ffdcb5', '크림'], ['#fff1a0', '연노랑'], ['#c4eaa8', '연초록'], ['#bfe2ff', '연하늘'], ['#dccbf5', '연보라'],
  ['#f07aa0', '분홍'], ['#e8b48a', '살구'], ['#8ccb3e', '연두'], ['#17a398', '청록'], ['#4fb4e8', '하늘'], ['#a83c8c', '자주'],
  ['#e5302e', '빨강'], ['#f08a1c', '주황'], ['#ffd200', '노랑'], ['#2e9e4f', '초록'], ['#1e62d0', '파랑'], ['#7a44b8', '보라'],
  ['#a8201e', '진빨강'], ['#8a5a34', '갈색'], ['#b8901a', '황토'], ['#1d6b37', '진초록'], ['#253a8c', '남색'], ['#4e2878', '진보라'],
];

const OLD_RE = /^[0-9a-c]{256}$/;
const NEW_RE = /^m2:(?:\.|[0-9a-f]{6}){256}$/;

/** 칸 값 — 0 = 빈칸, 색 = 0x1000000 | RGB(검정도 0이 아니게) */
export function hexCell(hex: string): number {
  return 0x1000000 | parseInt(hex.slice(1, 7), 16);
}

/** 칸 값 → #rrggbb(소문자) */
export function cellHex(v: number): string {
  return `#${(v & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function isMaskArt(v: unknown): v is string {
  return typeof v === 'string' && (OLD_RE.test(v) || NEW_RE.test(v));
}

export function emptyMask(): string {
  return '0'.repeat(MASK_CELLS);
}

/** 그림 → 칸 값 256개(옛 판·새 판 둘 다). 깨진 값은 빈 판 */
export function maskCells(art: string): Uint32Array {
  const out = new Uint32Array(MASK_CELLS);
  if (!isMaskArt(art)) return out;
  if (!art.startsWith('m2:')) {
    for (let i = 0; i < MASK_CELLS; i++) {
      const n = parseInt(art[i], 16);
      if (n) out[i] = hexCell(MASK_PALETTE[n]);
    }
    return out;
  }
  for (let i = 0, p = 3; i < MASK_CELLS; i++) {
    if (art[p] === '.') { p += 1; continue; }
    out[i] = 0x1000000 | parseInt(art.slice(p, p + 6), 16);
    p += 6;
  }
  return out;
}

/** 칸 값 → 새 판 문자열 */
export function encodeMask(cells: ArrayLike<number>): string {
  let s = 'm2:';
  for (let i = 0; i < MASK_CELLS; i++) {
    const v = cells[i] ?? 0;
    s += v ? cellHex(v).slice(1) : '.';
  }
  return s;
}

export function maskIsBlank(art: string): boolean {
  return !maskCells(art).some((v) => v !== 0);
}

/** 그림에 쓴 색(처음 나온 순서, 빈칸 빼고) — 마스크 색 도트 이펙트와 도트판 「내 색」이 쓴다 */
export function maskColors(art: string): string[] {
  const used = new Set<number>();
  for (const v of maskCells(art)) if (v) used.add(v);
  return [...used].map(cellHex);
}

/** 색 만들기 — 색상 0~360 · 채도 0~100 · 밝기 0~100(HSL) → #rrggbb */
export function hslHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const ch = (n: number): string => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

/** #rrggbb → [색상, 채도, 밝기](정수, hslHex의 반대) */
export function hexHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60) % 360, Math.round(s * 100), Math.round(l * 100)];
}

/** 이웃 4칸 채우기 — 같은 값으로 이어진 칸을 color로. 새 배열 */
export function floodFill(cells: ArrayLike<number>, x: number, y: number, color: number): Uint32Array {
  const out = Uint32Array.from(cells as ArrayLike<number>);
  if (x < 0 || y < 0 || x >= MASK_N || y >= MASK_N) return out;
  const from = out[y * MASK_N + x];
  if (from === color) return out;
  const stack = [y * MASK_N + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (out[i] !== from) continue;
    out[i] = color;
    const cx = i % MASK_N;
    if (cx > 0) stack.push(i - 1);
    if (cx < MASK_N - 1) stack.push(i + 1);
    if (i >= MASK_N) stack.push(i - MASK_N);
    if (i < MASK_CELLS - MASK_N) stack.push(i + MASK_N);
  }
  return out;
}

/** 두 칸 사이 칸들(브레젠험, 양 끝 포함) — 손가락이 빨리 지나가도 선이 끊기지 않게 */
export function cellLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return pts;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** 판 안 칸 a와 판 밖 칸 b를 잇는 선이 판 가장자리에서 걸리는 칸 — 빠르게 드나들어도 가장자리까지 칠해지게 */
export function edgeCell([x0, y0]: readonly [number, number], [x1, y1]: readonly [number, number]): [number, number] {
  let t = 1;
  for (const [a, b] of [[x0, x1], [y0, y1]] as const) {
    if (b < 0) t = Math.min(t, a / (a - b));
    else if (b > MASK_N - 1) t = Math.min(t, (MASK_N - 1 - a) / (b - a));
  }
  return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)];
}

/** 상점 진열용 견본 — 사기 전엔 이 얼굴을 씌워 보여 준다 */
export const SAMPLE_MASK =
  '0000011111100000' +
  '0001166666611000' +
  '0016666666666100' +
  '0166666666666610' +
  '0166666666666610' +
  '1666116666116661' +
  '1666116666116661' +
  '1666666666666661' +
  '16aa66666666aa61' +
  '1666616666166661' +
  '0166661111666610' +
  '0166666666666610' +
  '0016666666666100' +
  '0001166666611000' +
  '0000011111100000' +
  '0000000000000000';

/** 졸라맨이 쓰는 그림 — 아직 안 그렸으면(빈 그림·깨진 값) 견본. 상점 그림과 판 속이 같은 규칙을 탄다 */
export function wornMask(art: string): string {
  return isMaskArt(art) && !maskIsBlank(art) ? art : SAMPLE_MASK;
}
