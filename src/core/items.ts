// 보급 상자 — 1막·토코톤에서 건물을 다 부술 때마다 세고, SUPPLY 주기마다 하나를 바로 준다.
// 상자가 떨어져 열리는 건 렌더 연출('supply' 이벤트)이다. 한 레인이라 상자는 늘 졸라맨에게
// 떨어지니 시뮬에 낙하를 둘 이유가 없다. 종류는 고정 순서 — rngState를 쓰지 않는다(스포너 결정성).

import type { GameState, ItemId } from './types';
import { addGauge } from './combat';
import { GUARD_GAUGE, PLAYER, STACK, SUPPLY } from '../config';

/** sim이 1막·토코톤의 stackDestroy마다 부른다 (모드 확인은 호출측). 3·8·13…번째에 상자. */
export function onBuildingDown(s: GameState): void {
  s.drops += 1;
  if (s.drops % SUPPLY.EVERY !== SUPPLY.FIRST) return;
  const item = pickItem(s);
  applyItem(s, item);
  s.events.push({ kind: 'supply', item, y: s.player.y + PLAYER.H + 20 });
}

/** 순서대로 돈다. 안전모를 이미 쓰고 있으면 다음 것. */
export function pickItem(s: GameState): ItemId {
  const r = SUPPLY.ROTATION;
  let i = Math.floor(s.drops / SUPPLY.EVERY) % r.length;
  if (s.hat && r[i] === 'hat') i = (i + 1) % r.length;
  return r[i];
}

export function applyItem(s: GameState, item: ItemId): void {
  switch (item) {
    case 'gloves': s.guardGauge = GUARD_GAUGE.MAX; return;
    case 'coffee': addGauge(s, SUPPLY.COFFEE_GAUGE); return;
    case 'hat': s.hat = true; return;
    case 'dust': return; // 먼지는 저장 몫 — scenes가 supply 이벤트를 보고 지급한다
  }
}

/**
 * 안전모가 깔림 1회를 대신 받는다 — 목숨·콤보 그대로, 건물은 튕겨 올리고 짧은 무적.
 * 값은 깔림 방치 바운스(stepPinned)와 같다: 무적이 스택 왕복(≈47f)보다 길면 다음 "쿵"이 안 온다.
 */
export function absorbWithHat(s: GameState): void {
  s.hat = false;
  const st = s.stack;
  if (st?.resting) {
    st.vy = STACK.PIN_MERCY_V;
    st.resting = false;
    st.y = Math.max(st.y, 0.001);
  }
  s.player.invulnTicks = PLAYER.PIN_TIMEOUT_IFRAMES;
  s.events.push({ kind: 'hatBreak', y: s.player.y + PLAYER.H }); // 머리 높이 — 파편이 거기서 튄다
}
