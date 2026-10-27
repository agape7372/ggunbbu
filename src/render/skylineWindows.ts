// 야간 스카이라인 — 선화 배경의 "작게 닫힌 칸"(창)을 잉크로 채운다.
// 원본 PNG는 건드리지 않는다: 배경을 오프스크린에 굽는 순간에만 픽셀을 읽어 한 번 처리한다.
// 순수 함수(RGBA 배열만 받는다) — DOM 없음.

/** 이 밝기(0~255)보다 밝으면 "종이색"으로 본다. 선화의 안티앨리어싱 가장자리는 이보다 어둡다. */
const LIGHT_LUMA = 190;

/**
 * 종이색 픽셀을 4방향 연결 덩어리로 묶고, 면적이 maxArea 이하이면서 화면 가장자리에 닿지 않는 덩어리를
 * `ink`(RGB)로 칠한다. 하늘·건물 몸통은 maxArea보다 훨씬 커서 남고, 창만 채워진다.
 * 반환: 채운 덩어리 수.
 */
export function fillSmallPaperPockets(
  px: Uint8ClampedArray, w: number, h: number, maxArea: number,
  ink: readonly [number, number, number],
): number {
  const n = w * h;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  const isLight = (i: number): boolean =>
    0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2] > LIGHT_LUMA && px[i * 4 + 3] > 128;
  let filled = 0;
  for (let start = 0; start < n; start++) {
    if (seen[start] || !isLight(start)) continue;
    // 덩어리 하나를 queue[0..tail)에 모은다 — 같은 배열을 큐와 목록으로 쓴다.
    let head = 0;
    let tail = 0;
    let border = false;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      if (x > 0) { const j = i - 1; if (!seen[j] && isLight(j)) { seen[j] = 1; queue[tail++] = j; } }
      if (x < w - 1) { const j = i + 1; if (!seen[j] && isLight(j)) { seen[j] = 1; queue[tail++] = j; } }
      if (y > 0) { const j = i - w; if (!seen[j] && isLight(j)) { seen[j] = 1; queue[tail++] = j; } }
      if (y < h - 1) { const j = i + w; if (!seen[j] && isLight(j)) { seen[j] = 1; queue[tail++] = j; } }
    }
    if (border || tail > maxArea) continue;
    for (let k = 0; k < tail; k++) {
      const o = queue[k] * 4;
      px[o] = ink[0]; px[o + 1] = ink[1]; px[o + 2] = ink[2]; px[o + 3] = 255;
    }
    filled += 1;
  }
  return filled;
}
