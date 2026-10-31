// 종이 오려내기 후광 — 그림 실루엣을 아이보리로 1.5~2px 부풀려 그림 밑에 한 번 깐다.
// 졸라맨·번개·탄·드론이 기와 지붕선 같은 잡다한 배경에 묻히지 않게 하는 "획 문법" 장치(그림자·그라데이션 없음).
// 오프스크린 캐시는 캔버스 DPR과 무관하게 HALO_SS배(기본)로 한 번만 굽는다. 크게 그리는 원본(홈 뿌뿌 프레임)은 그 배율을 넘겨 같이 굽는다.
// 이 모듈은 로드 시 DOM을 만지지 않는다.

import { JUICE_SYS, PALETTE } from '../config';

export interface Halo {
  cv: HTMLCanvasElement;
  /** 후광 캔버스가 원본보다 사방으로 더 나간 논리 px */
  pad: number;
  /** 구운 배율(논리 1px = 캐시 ss px) */
  ss: number;
}

/**
 * src의 (sx,sy,sw,sh) 조각을 논리 크기 dw×dh로 줄인 실루엣의 후광 캔버스. DOM이 없거나 실패하면 null.
 * 그릴 때는 `drawImage(halo.cv, dx - halo.pad, dy - halo.pad, halo.cv.width / halo.ss, halo.cv.height / halo.ss)`.
 */
export function makeHalo(
  src: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,
  dw: number, dh: number,
  ss: number = JUICE_SYS.HALO_SS,
): Halo | null {
  if (typeof document === 'undefined') return null;
  const RADIUS = JUICE_SYS.HALO_PX * ss; // 캐시 픽셀 단위 번짐 반경
  const PAD = Math.ceil(RADIUS) + 1; // 캐시 픽셀
  const DIRS = Math.max(16, Math.ceil(RADIUS * 4)); // 반경이 커지면 방향도 늘린다 — 16방향 그대로면 큰 배율에서 끝이 톱니가 된다
  try {
    const w = Math.ceil(dw * ss) + PAD * 2;
    const h = Math.ceil(dh * ss) + PAD * 2;
    const body = document.createElement('canvas');
    body.width = w;
    body.height = h;
    const bc = body.getContext('2d');
    if (!bc) return null;
    bc.imageSmoothingEnabled = true;
    bc.drawImage(src, sx, sy, sw, sh, PAD, PAD, dw * ss, dh * ss);

    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    if (!c) return null;
    for (let i = 0; i < DIRS; i++) {
      const a = (i / DIRS) * Math.PI * 2;
      c.drawImage(body, Math.cos(a) * RADIUS, Math.sin(a) * RADIUS);
    }
    c.drawImage(body, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = PALETTE.BG;
    c.fillRect(0, 0, w, h);
    return { cv, pad: PAD / ss, ss };
  } catch {
    return null;
  }
}

/** 후광을 그린다. (dx,dy) = 원본 그림이 놓일 논리 좌표 좌상단. */
export function drawHalo(ctx: CanvasRenderingContext2D, halo: Halo, dx: number, dy: number): void {
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true; // ss배 캐시를 논리 크기로 — 부드럽게 줄여야 후광 가장자리가 안 깨진다
  ctx.drawImage(halo.cv, dx - halo.pad, dy - halo.pad, halo.cv.width / halo.ss, halo.cv.height / halo.ss);
  ctx.imageSmoothingEnabled = prev;
}

// 같은 그림 객체·같은 조각이면 후광도 하나 — 이미지가 다시 로드되면(새 객체) 자연히 새로 굽는다.
const cache = new WeakMap<object, Map<string, Halo | null>>();

/** 캐시된 후광(없으면 굽는다). id = 같은 src 안에서 조각을 가르는 이름(프레임 번호 등). */
export function haloFor(
  src: CanvasImageSource & object,
  id: string,
  sx: number, sy: number, sw: number, sh: number,
  dw: number, dh: number,
  ss?: number,
): Halo | null {
  let m = cache.get(src);
  if (!m) { m = new Map(); cache.set(src, m); }
  if (m.has(id)) return m.get(id)!;
  const halo = makeHalo(src, sx, sy, sw, sh, dw, dh, ss);
  m.set(id, halo);
  return halo;
}
