// 건뿌 — PNG 에셋 로딩 파이프라인.
// manifest.json 하나로 이미지 정의를 관리 — 에셋 추가 시 이 파일이 아니라 manifest만 고친다.
// 개별 이미지 로드 실패는 삼킨다(에셋을 점진적으로 추가할 것이므로 필수) — 실패한 키는
// img()/drawAsset()에서 null/false로 드러나고, 호출부는 그걸 보고 기존 코드 스프라이트로 폴백한다.

import manifestJson from '../assets/manifest.json';

export interface AssetEntry {
  src: string;
  w: number;
  h: number;
  anchor?: 'topleft' | 'center' | 'foot';
  /** 배경: 소스가 dest보다 크면 아래(스카이라인)를 맞춘다. */
  align?: 'top' | 'bottom';
  frames?: number;
  slice9?: [number, number, number, number];
  /** 이 색에 가까운 픽셀을 투명 처리 (아이보리 배경 시트용). */
  chroma?: string;
  /** 스케일 시 보간. 기본 true(배경/라인아트). 픽셀아트면 false. */
  smooth?: boolean;
}

interface Manifest {
  version: number;
  basePath: string;
  images: Record<string, AssetEntry>;
}

const manifest = manifestJson as unknown as Manifest;

type LoadedImage = HTMLImageElement | HTMLCanvasElement;

const loaded = new Map<string, LoadedImage>();

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyChroma(image: HTMLImageElement, hex: string): LoadedImage {
  const rgb = parseHex(hex);
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  if (!rgb || w < 1 || h < 1) return image;
  try {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true });
    if (!c) return image;
    c.drawImage(image, 0, 0);
    const data = c.getImageData(0, 0, w, h);
    const [cr, cg, cb] = rgb;
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const d = Math.abs(px[i] - cr) + Math.abs(px[i + 1] - cg) + Math.abs(px[i + 2] - cb);
      if (d < 48) px[i + 3] = 0;
    }
    c.putImageData(data, 0, 0);
    return cv;
  } catch {
    return image;
  }
}

function sourceSize(image: LoadedImage): { w: number; h: number } {
  if (image instanceof HTMLCanvasElement) return { w: image.width, h: image.height };
  return { w: image.naturalWidth, h: image.naturalHeight };
}

function loadOne(key: string, entry: AssetEntry): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      loaded.set(key, entry.chroma ? applyChroma(image, entry.chroma) : image);
      resolve();
    };
    image.onerror = () => {
      resolve(); // 실패해도 reject하지 않음 — 이 키만 null로 남고 나머지는 계속 진행
    };
    image.src = manifest.basePath + entry.src;
  });
}

/** manifest의 모든 이미지를 병렬 로드. 개별 실패는 삼키므로 이 프라미스는 항상 resolve된다. */
export async function preloadAssets(): Promise<void> {
  await Promise.all(
    Object.entries(manifest.images).map(([key, entry]) => loadOne(key, entry))
  );
}

/** 로드 성공한 이미지. 미로드/실패면 null(호출부가 폴백 여부를 직접 판단할 때 사용). */
export function img(key: string): LoadedImage | null {
  return loaded.get(key) ?? null;
}

export function hasAsset(key: string): boolean {
  return loaded.has(key);
}

export function assetEntry(key: string): AssetEntry | undefined {
  return manifest.images[key];
}

function destOrigin(entry: AssetEntry, x: number, y: number): { dx: number; dy: number } {
  if (entry.anchor === 'center') return { dx: x - entry.w / 2, dy: y - entry.h / 2 };
  if (entry.anchor === 'foot') return { dx: x - entry.w / 2, dy: y - entry.h };
  return { dx: x, dy: y };
}

/**
 * 에셋을 논리 좌표(x,y)에 그린다. 이미지가 없으면(미로드·404 등) 아무것도 그리지 않고 false —
 * 호출부는 false를 보고 기존 코드 스프라이트로 폴백해야 한다. 성공하면 true.
 * frames가 있으면 시트를 가로 n등분해 frame번째 칸만 그린다(칸 폭 = 원본 가로 / frames).
 * anchor:'center'면 (x,y)를 이미지 중심으로, 'foot'이면 하단 중심으로 삼는다.
 * 항상 논리 크기(w,h)로 축소해서 그린다.
 */
export function drawAsset(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  frame = 0
): boolean {
  const image = loaded.get(key);
  const entry = manifest.images[key];
  if (!image || !entry) return false;

  const src = sourceSize(image);
  if (src.w < 1 || src.h < 1) return false;

  const frames = entry.frames && entry.frames > 0 ? entry.frames : 1;
  const srcFrameW = src.w / frames;
  const srcFrameH = src.h;
  const sx = (Math.abs(frame) % frames) * srcFrameW;
  const { dx, dy } = destOrigin(entry, x, y);

  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = entry.smooth !== false;
  try {
    ctx.drawImage(image, sx, 0, srcFrameW, srcFrameH, dx, dy, entry.w, entry.h);
  } catch {
    ctx.imageSmoothingEnabled = prevSmooth;
    return false;
  }
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

/**
 * 필드(dest)를 덮되 소스의 하단(스카이라인)을 맞춘다.
 * 360×640 원본도 360×470 필드에 넣으면 위가 잘리고 지평선이 지면에 붙는다.
 * 이미 470 높이인 시트는 그대로 들어간다.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  key: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): boolean {
  const image = loaded.get(key);
  const entry = manifest.images[key];
  if (!image || !entry) return false;
  const src = sourceSize(image);
  if (src.w < 1 || src.h < 1 || dw < 1 || dh < 1) return false;

  const scale = Math.max(dw / src.w, dh / src.h);
  const rw = src.w * scale;
  const rh = src.h * scale;
  const ox = dx + (dw - rw) / 2;
  const pinBottom = entry.align !== 'top';
  const oy = pinBottom ? dy + dh - rh : dy;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.imageSmoothingEnabled = entry.smooth !== false;
  try {
    ctx.drawImage(image, ox, oy, rw, rh);
  } catch {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}
