// PNG 층 타일의 수명·검증·행 분할. 프로시저럴 폴백은 sprites.ts가 소유한다.
import { ACT1, VIEW } from '../config';
import { assetEntry, imageSize, img, releaseAsset } from './assets';
import { FLOOR_ROWS, SPECIAL_ROWS } from './floorSheets';

const tiles = new Map<string, HTMLCanvasElement>();

function sliceSheet(assetKey: string, keys: readonly string[]): void {
  const sheet = img(assetKey);
  const entry = assetEntry(assetKey);
  if (!sheet || !entry) return;
  const { w, h } = imageSize(sheet);
  // 시트는 논리 크기(entry.w×entry.h)의 정수 배 픽셀이다(2배 내보내기). 배율 k만큼 소스 좌표에 적용해 자른다.
  const k = w / entry.w;
  if (entry.rows !== keys.length || entry.rowH !== VIEW.FLOOR_H ||
      entry.w !== VIEW.LANE_W || entry.h !== keys.length * VIEW.FLOOR_H ||
      !Number.isInteger(k) || k < 1 || h !== entry.h * k) return;

  const rows: HTMLCanvasElement[] = [];
  try {
    for (let row = 0; row < keys.length; row++) {
      const canvas = document.createElement('canvas');
      canvas.width = entry.w * k;
      canvas.height = entry.rowH * k;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.drawImage(sheet, 0, row * entry.rowH * k, entry.w * k, entry.rowH * k,
        0, 0, entry.w * k, entry.rowH * k);
      rows.push(canvas);
    }
  } catch {
    return; // 시트 전체를 성공적으로 잘랐을 때만 공개한다.
  }
  keys.forEach((key, row) => tiles.set(key, rows[row]));
  releaseAsset(assetKey); // 조각이 원본을 대신한다 — 시트를 한 번 더 들고 있지 않는다
}

/** preload 완료 뒤 호출. 다시 로드할 때 실패한 옛 PNG가 남지 않게 교체한다. */
export function refreshFloorSheetAssets(): void {
  tiles.clear();
  for (const theme of ACT1.CHAPTER_THEMES) {
    sliceSheet(`floors-${theme}`, FLOOR_ROWS.map(row => `${theme}:${row}`));
  }
  sliceSheet('floors-special', SPECIAL_ROWS);
}

export function floorSheetTile(key: string): HTMLCanvasElement | undefined {
  return tiles.get(key);
}
