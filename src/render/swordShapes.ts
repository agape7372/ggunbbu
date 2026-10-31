// 칼 모양 자료 — 상점 그림(ui/ink.ts swordSvg)과 판 속 졸라맨 손의 칼(render/sprites.ts)이 같은 자료를 쓴다.
// 120×300 칸, 칼끝이 위 · 손잡이가 아래. 기본 채움 = 먹, class "p" = 한지색 무늬, "pr" = 한지색 고리(속 빈 테), "y" = 참격 노랑, "g" = 코등이(먹).
// 이 모듈은 DOM을 만지지 않는다(node 테스트가 import). 캔버스 쪽은 parseShape가 푼 조각을 Path2D로 바꿔 그린다.

/** 칼 열셋 + 마스크의 SVG 몸통 조각 */
const BLADE = '<path d="M58 6 L62 6 Q70 80 76 150 Q79 190 78 214 L42 214 Q41 190 44 150 Q50 80 58 6 Z"/>';
const DRY = '<path class="p" d="M58.6 70 L61.4 70 L62 194 L59 194 Z"/>';
const WIDE = '<path d="M42 32 L60 4 L78 32 L80 214 L40 214 Z"/>';
const WDRY = '<path class="p" d="M58.5 56 L61.5 56 L62 190 L59 190 Z"/>';
const GUARD = '<path class="g" d="M16 208 Q60 202 104 212 L103 223 Q60 229 18 227 Z"/>';
const GRIP = '<path d="M53 228 L67 228 Q70 262 66 292 L56 294 Q50 262 53 228 Z"/><path d="M50 290 Q60 284 72 290 Q73 298 60 300 Q47 298 50 290 Z"/>';
/** 불꽃 = 날 위쪽 1/3에서 바깥·위로 휘어 나가는 초승달 획 6 */
const LICKS = '<path d="M64 96 C78 86 90 70 86 40 C96 66 92 94 70 110 Z"/><path d="M62 58 C72 50 80 40 76 18 C86 40 82 60 66 68 Z"/><path d="M68 136 C84 126 90 112 84 92 C94 112 90 138 72 150 Z"/><path d="M56 84 C40 74 34 56 40 30 C34 58 40 82 52 96 Z"/><path d="M58 42 C50 34 46 24 50 8 C44 26 48 42 56 50 Z"/><path d="M52 122 C38 112 32 96 36 76 C30 100 36 124 48 136 Z"/>';
/** 불꽃 혀 끝의 참격 노랑 — 혀 여섯을 끝점 기준 0.55로 줄인 같은 모양(먹 혀 안에 든다) */
const LICKY = '<path class="y" d="M73.9 70.8 C81.6 65.3 88.2 56.5 86 40 C91.5 54.3 89.3 69.7 77.2 78.5 Z"/><path class="y" d="M68.3 40 C73.8 35.6 78.2 30.1 76 18 C81.5 30.1 79.3 41.1 70.5 45.5 Z"/><path class="y" d="M75.2 116.2 C84 110.7 87.3 103 84 92 C89.5 103 87.3 117.3 77.4 123.9 Z"/><path class="y" d="M48.8 59.7 C40 54.2 36.7 44.3 40 30 C36.7 45.4 40 58.6 46.6 66.3 Z"/><path class="y" d="M54.4 26.7 C50 22.3 47.8 16.8 50 8 C46.7 17.9 48.9 26.7 53.3 31.1 Z"/><path class="y" d="M44.8 101.3 C37.1 95.8 33.8 87 36 76 C32.7 89.2 36 102.4 42.6 109 Z"/>';
/** 그라인더 원판 톱니 8 */
const TEETH = (() => {
  let s = '';
  const r = 44, cx = 60, cy = 72;
  const p = (ra: number, ang: number): string => `${(cx + ra * Math.cos(ang)).toFixed(1)} ${(cy + ra * Math.sin(ang)).toFixed(1)}`;
  for (let k = 0; k < 8; k++) {
    const a = ((k * 45 + 22) * Math.PI) / 180;
    s += `<path d="M${p(r, a - 0.16)} L${p(r + 17, a + 0.05)} L${p(r, a + 0.16)} Z"/>`;
  }
  return s;
})();

/** 품목 id(무기 열둘 + mask) → 칼 그림 속(120×300). 모르는 id는 철거칼 */
export const SWORDS: Readonly<Record<string, string>> = {
  iron: WIDE + WDRY + GUARD + GRIP,
  saw: '<path d="M46 8 L60 8 L74 30 L62 44 L76 66 L62 82 L76 104 L62 120 L76 142 L62 158 L76 180 L62 196 L76 214 L46 214 Z"/><path class="p" d="M52 40 L55 40 L56 196 L53 196 Z"/>' + GUARD + GRIP,
  hazard: WIDE + '<path class="p" d="M40 58 L80 48 L80 62 L40 72 Z"/><path class="p" d="M40 108 L80 98 L80 112 L40 122 Z"/><path class="p" d="M40 158 L80 148 L80 162 L40 172 Z"/>' + GUARD + GRIP,
  beam: '<path d="M34 6 L86 6 L86 22 L74 22 L74 198 L86 198 L86 214 L34 214 L34 198 L46 198 L46 22 L34 22 Z"/><path class="p" d="M52 50 L68 50 L68 72 L52 72 Z"/><path class="p" d="M52 100 L68 100 L68 122 L52 122 Z"/><path class="p" d="M52 150 L68 150 L68 172 L52 172 Z"/>' + GUARD + GRIP,
  flame: BLADE + DRY + LICKS + LICKY + GUARD + GRIP,
  frost: BLADE + DRY + '<path d="M55 30 L60 -10 L65 30 Z"/><path d="M57 36 L36 4 L62 26 Z"/><path d="M63 36 L84 4 L58 26 Z"/><path d="M50 86 L24 64 L54 74 Z"/><path d="M70 86 L96 64 L66 74 Z"/>' + GUARD + GRIP,
  onyx: '<path d="M48 6 L72 6 Q88 80 90 214 L30 214 Q32 80 48 6 Z"/>' + GUARD + GRIP,
  gold: BLADE + '<circle class="pr" cx="60" cy="72" r="8"/><circle class="pr" cx="60" cy="132" r="8"/><path d="M4 198 Q60 188 116 198 L118 228 Q60 238 2 228 Z"/><path class="p" d="M20 208 L40 206 L41 219 L21 221 Z"/><path class="p" d="M80 206 L100 208 L99 221 L79 219 Z"/>' + GRIP,
  sword: '<path d="M44 124 L60 96 L76 120 Q86 160 82 214 L40 214 Q38 160 44 124 Z"/><path class="p" d="M52 130 L55 130 L56 190 L53 190 Z"/>' + GUARD + GRIP,
  hammer: '<path d="M14 36 L106 32 Q112 34 110 60 L108 98 Q106 104 98 102 L16 100 Q10 98 10 80 Z"/><path class="p" d="M22 48 L40 46 L40 54 L22 56 Z"/><path d="M53 102 L67 102 Q71 200 66 294 L56 296 Q49 200 53 102 Z"/>',
  /** 빠루 = 굵은 지렛대 + 끝이 갈라진 갈고리 + 납작한 발 */
  crowbar: '<path d="M44 292 L44 86 Q44 42 70 32 Q96 24 108 48 L112 66 L98 70 L94 56 Q86 44 74 48 Q60 54 60 86 L60 292 Z"/><path class="p" d="M100 44 L118 58 L108 72 Z"/><path d="M36 288 L70 288 L74 300 L34 300 Z"/>',
  /** 그라인더 = 톱니 8 원판 + 가운데 축 + 아래 손잡이 + 옆 손잡이 */
  grinder: TEETH + '<circle cx="60" cy="72" r="44"/><circle class="p" cx="60" cy="72" r="11"/><path d="M52 114 L68 114 L70 294 L50 294 Z"/><path d="M66 150 L110 140 L112 154 L68 164 Z"/>',
  /** 마스크 = 도트 얼굴 가면 + 양쪽 끈. 칸 아래쪽 절반에 둔다 */
  mask: '<g transform="translate(0 130)"><path d="M22 50 Q60 28 98 50 L100 122 Q60 152 20 122 Z"/><path class="p" d="M30 58 Q60 42 90 58 L92 116 Q60 140 28 116 Z"/><rect x="40" y="70" width="12" height="12"/><rect x="68" y="70" width="12" height="12"/><rect x="44" y="100" width="8" height="8"/><rect x="52" y="106" width="8" height="8"/><rect x="60" y="106" width="8" height="8"/><rect x="68" y="100" width="8" height="8"/><path d="M22 90 L2 72 L7 66 L26 82 Z"/><path d="M98 90 L118 72 L113 66 L94 82 Z"/></g>',
};

/** 판 속에서 쥐는 법 — 칸 위 손 자리(handY)와 칼끝 자리(tipY)(둘 다 x = 60 위), k = 손 → 칼끝 길이가 포즈가 주는 길이(L)의 몇 배인지.
 *  대검·철거칼은 손잡이 위(코등이 아래), 오함마는 자루 밑동, 빠루는 막대의 뒤쪽 조금 위(앞 갈고리까지 1.14L), 그라인더는 손잡이 밑동 → 원판 중심(0.58L) */
export interface SwordHold { handY: number; tipY: number; k: number }
const GREAT_HOLD: SwordHold = { handY: 228, tipY: 6, k: 1 };
export const SWORD_HOLD: Readonly<Record<string, SwordHold>> = {
  iron: GREAT_HOLD, saw: GREAT_HOLD, hazard: GREAT_HOLD, beam: GREAT_HOLD,
  flame: GREAT_HOLD, frost: GREAT_HOLD, onyx: GREAT_HOLD, gold: GREAT_HOLD,
  sword: { handY: 228, tipY: 96, k: 1 },
  hammer: { handY: 290, tipY: 67, k: 1 },
  crowbar: { handY: 262, tipY: 32, k: 1.14 },
  grinder: { handY: 290, tipY: 72, k: 0.58 },
};

/** 풀어낸 조각 하나 — d는 SVG path 문자열(원 · 사각형도 path로 바꿔 담는다), cls는 색 뜻 */
export interface ShapePart { cls: string; d: string }

const ELEMENT = /<(path|circle|rect)\b([^>]*?)\/?>/g;
const ATTR = /([\w-]+)="([^"]*)"/g;

/** SVG 몸통 문자열 → 조각 목록. 순수 문자열 처리(DOM · Path2D 없음). 같은 id는 한 번만 풀어 둔다 */
const parsed = new Map<string, readonly ShapePart[]>();
export function parseShape(id: string): readonly ShapePart[] {
  const hit = parsed.get(id);
  if (hit) return hit;
  const parts: ShapePart[] = [];
  for (const m of (SWORDS[id] ?? SWORDS.sword).matchAll(ELEMENT)) {
    const a: Record<string, string> = {};
    for (const [, k, v] of m[2].matchAll(ATTR)) a[k] = v;
    const n = (k: string): number => Number(a[k] ?? 0);
    let d = '';
    if (m[1] === 'path') d = a.d ?? '';
    else if (m[1] === 'circle') {
      const [cx, cy, r] = [n('cx'), n('cy'), n('r')];
      d = `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    } else d = `M${n('x')} ${n('y')} h${n('width')} v${n('height')} h${-n('width')} Z`;
    if (d) parts.push({ cls: a.class ?? '', d });
  }
  parsed.set(id, parts);
  return parts;
}
