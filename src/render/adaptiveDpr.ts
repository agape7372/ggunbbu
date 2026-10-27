// 적응형 해상도: 프레임이 계속 늦으면 메인 캔버스 배율(dpr)만 한 단계씩 낮춘다.
// 조작·UI는 DOM이라 영향이 없고, 세션 중 다시 올리지 않는다(올렸다 내렸다 하면 화면이 깜빡인다).
import { VIEW } from '../config';

/** 지금 dpr보다 낮은 다음 단계. 더 내릴 곳이 없으면 null. */
export function nextDprStep(current: number): number | null {
  return VIEW.DPR_LADDER.find((v) => v < current) ?? null;
}

export interface AdaptiveDpr {
  /** 프레임 간격(ms)과 지금 dpr을 넣는다. 한 단계 내릴 때만 새 dpr을 돌려준다. */
  sample(dtMs: number, dpr: number): number | null;
}

export function createAdaptiveDpr(): AdaptiveDpr {
  const win: number[] = [];
  let sum = 0;
  let slowMs = 0;
  return {
    sample(dtMs, dpr) {
      const dt = Math.min(dtMs, VIEW.ADAPT_MAX_DT_MS);
      win.push(dt);
      sum += dt;
      // 창이 WINDOW_MS를 막 넘기는 길이로 유지한다.
      while (win.length > 1 && sum - win[0] >= VIEW.ADAPT_WINDOW_MS) sum -= win.shift()!;
      if (sum < VIEW.ADAPT_WINDOW_MS) return null; // 아직 1초치가 안 모였다
      slowMs = sum / win.length > VIEW.ADAPT_SLOW_MS ? slowMs + dt : 0;
      if (slowMs < VIEW.ADAPT_HOLD_MS) return null;
      win.length = 0; sum = 0; slowMs = 0; // 새 해상도에서 처음부터 다시 모은다
      return nextDprStep(dpr);
    },
  };
}
