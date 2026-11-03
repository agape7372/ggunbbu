// 시작 장비 시트 — 판 시작 전 확인 창 안쪽. 항목마다 체크 · 그림 · 이름 · 보유 · 수량. 기본 해제.
// 보유가 0이면 그 자리에서 궤도조각으로 산다. 누름은 overlay가 받아 다시 그린다.

import './meta.css';
import { KITS, type Items, type KitPick } from '../meta/kit';
import { goods } from './goodsArt';

export interface KitView {
  items: Items;
  orbit: number;
  /** 아케이드면 맨손 기록 안내를 붙인다 */
  arcade: boolean;
}

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

export function kitHtml(v: KitView, sel: KitPick): string {
  const rows = KITS.map((k) => {
    const have = v.items[k.id];
    const n = sel[k.id] ?? 0;
    const max = Math.min(k.max, have);
    let act: string;
    if (have <= 0) {
      act = `<button type="button" class="btn kt-buy" data-act="kit-buy" data-kit="${k.id}" aria-label="${k.name} 사기, 궤도조각 ${k.orbit}"${v.orbit >= k.orbit ? '' : ' disabled'}>${goods('orb')}<b>${k.orbit}</b></button>`;
    } else {
      act = `<div class="kt-qty">
        <button type="button" class="kt-step" data-act="kit-minus" data-kit="${k.id}" aria-label="${k.name} 하나 빼기"${n > 0 ? '' : ' disabled'}>−</button>
        <b aria-live="polite">${n}</b>
        <button type="button" class="kt-step" data-act="kit-plus" data-kit="${k.id}" aria-label="${k.name} 하나 더"${n < max ? '' : ' disabled'}>+</button>
      </div>`;
    }
    return `<div class="kt-row${n > 0 ? ' on' : ''}">
      <button type="button" class="kt-check" role="checkbox" aria-checked="${n > 0}" aria-label="${k.name} 들고 가기" data-act="kit-toggle" data-kit="${k.id}"${have > 0 ? '' : ' disabled'}>${n > 0 ? CHECK : ''}</button>
      ${goods(k.id)}
      <div class="kt-txt">
        <p class="kt-name">${k.name}</p>
        <p class="kt-have">보유 ${have}</p>
      </div>
      ${act}
    </div>`;
  }).join('');
  const bare = v.arcade ? ' 목숨 · 필살을 들면 맨손 기록엔 안 남아요.' : '';
  const wallet = KITS.some((k) => v.items[k.id] <= 0) ? `<p class="kt-wallet">${goods('orb')}궤도조각 ${v.orbit}</p>` : '';
  return `<div class="kt">${rows}</div>
    <p class="kt-foot">고른 것은 시작하면 사라져요.${bare}</p>
    ${wallet}`;
}
