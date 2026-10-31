// 마스크(가면) — 사용자가 도트판에 찍은 16×16 그림. 저장 = 가면 목록 save.masks(최대 8장, 장마다 id · 이름 · 그림 문자열).
// 「가면 공방」(owned 'mask', 먼지 3000)을 연 뒤엔 새 가면을 공짜로 더 만든다. 쓰는 가면 = loadout.mask('mask'면 쓴다) + save.maskId.
// save.maskArt = 고른 가면의 그림(파생) — 렌더 · 타이틀 · 도감이 아직 이 문자열 하나를 읽는다. 바꾸는 길은 아래 함수들만(syncMaskArt가 맞춘다).
// 옛 저장(masks 없음): 'mask'를 가졌으면 maskArt가 [{ id: 'm1', name: '내 가면', art }] 한 장이 된다(loadMaskBook).
// 새 판 = `m2:` 뒤에 칸마다 `.`(빈칸) 또는 색 여섯 자리(16진 소문자). 「색 만들기」로 만든 색도 그대로 담는다.
// 옛 판 = 256자, 칸마다 옛 팔레트 번호 한 글자(0 빈칸 · 1~c). 견본과 옛 저장을 읽을 때만 쓴다.
// DOM/캔버스 없음. 그리기는 render/maskArt.ts, 도트판 화면은 ui/maskEditor.ts.

import type { Loadout, MaskEntry } from './types';

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

// ── 가면 목록 ─────────────────────────────────────────────────────────────

/** 가면 최대 장수 · 이름 최대 글자 수(유니코드 글자 단위) */
export const MASK_MAX = 8;
export const MASK_NAME_MAX = 10;
/** 옛 저장 한 장이 받는 이름 */
export const MASK_OLD_NAME = '내 마스크';

const ID_RE = /^m(\d{1,3})$/;
const idNo = (id: string): number => Number(ID_RE.exec(id)?.[1] ?? 0);

/** 이름 정리 — 조작 문자 빼고 앞뒤 공백을 걷고 10글자로 자른다. 비면 「마스크 N」(N = id 번호) */
export function cleanMaskName(raw: unknown, no: number): string {
  const s = typeof raw === 'string'
    // eslint-disable-next-line no-control-regex
    ? Array.from(raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, MASK_NAME_MAX).join('').trim()
    : '';
  return s || `마스크 ${no}`;
}

/** 저장에서 읽은 가면 목록 — 모양이 틀린 장은 버리고, id가 겹치면 앞 장만, 8장까지. 그림이 깨진 장은 빈 판으로 살린다 */
export function validMasks(v: unknown): MaskEntry[] {
  if (!Array.isArray(v)) return [];
  const out: MaskEntry[] = [];
  for (const e of v) {
    if (out.length >= MASK_MAX) break;
    const o = typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : null;
    const id = o?.id;
    if (!o || typeof id !== 'string' || !ID_RE.test(id) || out.some((m) => m.id === id)) continue;
    out.push({ id, name: cleanMaskName(o.name, idNo(id)), art: isMaskArt(o.art) ? o.art : emptyMask() });
  }
  return out;
}

/** 불러오기 — 목록이 있으면 검증, 없으면(옛 저장) 가면 공방이 열려 있을 때만 maskArt 한 장으로 옮긴다 */
export function loadMaskBook(
  rawMasks: unknown, rawId: unknown, art: string, ownsWorkshop: boolean,
): { masks: MaskEntry[]; maskId: string; maskArt: string } {
  const listed = validMasks(rawMasks);
  // 목록이 없거나 비었는데 공방이 열려 있으면: 옛 그림이 남아 있거나(옛 저장) 키 자체가 없을 때(그림 없이 산 옛 저장) 한 장으로 옮긴다.
  // 다 지운 저장은 deleteMask가 그림을 비워 두니 여기 안 걸린다
  const old = ownsWorkshop && (rawMasks === undefined || !maskIsBlank(art));
  const masks = listed.length ? listed : old ? [{ id: 'm1', name: MASK_OLD_NAME, art }] : [];
  const maskId = typeof rawId === 'string' && masks.some((m) => m.id === rawId) ? rawId : masks[0]?.id ?? '';
  return { masks, maskId, maskArt: masks.find((m) => m.id === maskId)?.art ?? art };
}

/** 도감 · 상점이 읽는 내 가면들 — 만든 순서 */
export function ownedMasks(save: { masks: readonly MaskEntry[] }): MaskEntry[] {
  return save.masks.map((m) => ({ ...m }));
}

/** 가면을 바꾸는 쪽이 만지는 저장 부분 */
export interface MaskSave {
  masks: MaskEntry[];
  maskId: string;
  maskArt: string;
  owned: string[];
  loadout: Loadout;
}

/** 쓰는 가면 id — 안 쓰면 'none' */
export function wornMaskId(s: Pick<MaskSave, 'loadout' | 'maskId'>): string {
  return s.loadout.mask === 'mask' ? s.maskId : 'none';
}

/** 파생 maskArt를 고른 가면에 맞춘다(목록이 비면 남은 옛 그림은 그대로 둔다) */
function syncMaskArt(s: MaskSave): void {
  const m = s.masks.find((x) => x.id === s.maskId);
  if (m) s.maskArt = m.art;
}

/** 공방을 막 열었을 때 — 목록이 비어 있고 옛 그림이 남아 있으면 그 그림이 첫 장이 된다 */
export function adoptLegacyMask(s: MaskSave): void {
  if (s.masks.length || maskIsBlank(s.maskArt)) return;
  s.masks = [{ id: 'm1', name: MASK_OLD_NAME, art: s.maskArt }];
  s.maskId = 'm1';
}

/** 새 가면 한 장(공짜) — 공방이 열려 있고 8장 미만일 때만. 그림이 있으면 고르고 바로 쓴다. 못 만들면 null */
export function createMask(s: MaskSave, name: unknown, art: string): MaskEntry | null {
  if (!s.owned.includes('mask') || s.masks.length >= MASK_MAX) return null;
  const no = Math.max(0, ...s.masks.map((m) => idNo(m.id))) + 1;
  const m: MaskEntry = { id: `m${no}`, name: cleanMaskName(name, no), art };
  s.masks = [...s.masks, m];
  // 그림이 있으면 바로 고르고 쓴다. 빈 판이면 지금 쓰는 가면을 안 바꾼다(첫 가면일 때만 고른다)
  if (!maskIsBlank(art)) {
    s.maskId = m.id;
    s.loadout = { ...s.loadout, mask: 'mask' };
  } else if (!s.masks.some((x) => x.id === s.maskId)) s.maskId = m.id;
  syncMaskArt(s);
  return m;
}

/** 이름 · 그림 고치기. 없는 id면 false. 쓰는 가면이 아니어도 쓰는 걸 바꾸지 않는다 */
export function updateMask(s: MaskSave, id: string, name: unknown, art: string): boolean {
  const at = s.masks.findIndex((m) => m.id === id);
  if (at < 0) return false;
  s.masks = s.masks.map((m, i) => (i === at ? { id, name: cleanMaskName(name, idNo(id)), art } : m));
  syncMaskArt(s);
  return true;
}

/** 지우기 — 쓰던 가면이면 벗는다(장착 'none'). 고른 가면이 지워지면 남은 첫 장이 고른 가면 */
export function deleteMask(s: MaskSave, id: string): boolean {
  if (!s.masks.some((m) => m.id === id)) return false;
  const worn = wornMaskId(s) === id;
  s.masks = s.masks.filter((m) => m.id !== id);
  if (s.maskId === id) s.maskId = s.masks[0]?.id ?? '';
  if (!s.masks.length) s.maskArt = emptyMask(); // 다 지웠다 — 남은 그림이 옛 저장처럼 되살아나지 않게
  if (worn) s.loadout = { ...s.loadout, mask: 'none' };
  syncMaskArt(s);
  return true;
}

/** 쓰기 — id = 가면 id 또는 'none'(벗기). 안 산 공방 · 없는 id면 false */
export function wearMask(s: MaskSave, id: string): boolean {
  if (id === 'none') {
    s.loadout = { ...s.loadout, mask: 'none' };
    return true;
  }
  if (!s.owned.includes('mask') || !s.masks.some((m) => m.id === id)) return false;
  s.maskId = id;
  s.loadout = { ...s.loadout, mask: 'mask' };
  syncMaskArt(s);
  return true;
}
