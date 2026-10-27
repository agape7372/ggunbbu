// 무대 맞춤: 화면에서 안전영역(상태바·제스처 바·노치)을 뺀 상자 안에 360×780 무대를 앉힌다.
// 인셋이 모두 0이면 예전 계산(전체 창 기준 레터박스)과 같은 값이 나온다.
import { VIEW } from '../config';

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface StageFit { scale: number; dx: number; dy: number }

/** 인셋이 이상한 값(음수·NaN·화면 대부분)이어도 무대가 0 크기가 되지 않게 각 변을 25%로 자른다. */
const clampInset = (v: number, span: number): number =>
  Number.isFinite(v) ? Math.max(0, Math.min(v, span * 0.25)) : 0;

/**
 * 창 크기 w×h와 인셋으로 무대의 배율과 이동량을 구한다.
 * #app이 무대를 창 한가운데에 놓으므로, 이동량은 "안전 상자 중심 − 창 중심"이다.
 */
export function fitStageBox(w: number, h: number, inset: Insets): StageFit {
  const t = clampInset(inset.top, h);
  const b = clampInset(inset.bottom, h);
  const l = clampInset(inset.left, w);
  const r = clampInset(inset.right, w);
  const scale = Math.min((w - l - r) / VIEW.W, (h - t - b) / VIEW.H);
  return { scale, dx: (l - r) / 2, dy: (t - b) / 2 };
}

export interface InsetProbe {
  read(): Insets;
  /** 인셋이 바뀌면(회전·내비 모드 전환·늦게 도착한 값) 부른다. ResizeObserver가 없으면 아무 일도 안 한다. */
  watch(cb: () => void): void;
}

/**
 * 보이지 않는 요소 하나로 안전영역을 읽는다.
 * env(safe-area-inset-*)와 캐패시터 셸이 넣는 --safe-area-inset-* 변수 중 큰 쪽을 쓴다.
 */
export function createInsetProbe(doc: Document = document): InsetProbe {
  const el = doc.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const pad = (side: string): string =>
    `padding-${side}:max(env(safe-area-inset-${side}, 0px), var(--safe-area-inset-${side}, 0px));`;
  el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;box-sizing:content-box;'
    + 'visibility:hidden;pointer-events:none;'
    + pad('top') + pad('right') + pad('bottom') + pad('left');
  doc.documentElement.appendChild(el);
  const px = (v: string): number => Number.parseFloat(v) || 0;
  return {
    read() {
      const cs = getComputedStyle(el);
      return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
    },
    watch(cb) {
      if (typeof ResizeObserver === 'undefined') return;
      new ResizeObserver(() => cb()).observe(el, { box: 'border-box' });
    },
  };
}
