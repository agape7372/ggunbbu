// 건물 데이터 모델 규칙: 레인 세그먼트 독립 HP, 층 전체 붕괴, 밀어올림.
import { describe, it, expect } from 'vitest';
import { makeFloor, makeStack, damageStack, stepStack, floorSpan } from '../src/core/building';
import { makeState } from '../src/core/sim';
import { spawnAct1Building } from '../src/core/spawner';
import { MAT_HP, VIEW } from '../src/config';

function stack3() {
  return makeStack({
    variant: 'building', theme: 'europe',
    floors: [makeFloor('hard'), makeFloor('mid'), makeFloor('weak')],
    y: 0,
  });
}

describe('세그먼트/붕괴 규칙 [정본 — 단일 레인]', () => {
  it('최하층 세그 HP 0 → 층 전체 붕괴, 위층은 온전', () => {
    const st = stack3();
    // hard HP3 → 2타로 1 남음
    expect(damageStack(st, 0, -1, 10, 1)).toBe('hit');
    expect(damageStack(st, 0, -1, 10, 1)).toBe('hit');
    expect(st.floors[0].segs[0].hp).toBe(1);
    // 마지막 타 → 층 제거
    expect(damageStack(st, 0, -1, 10, 1)).toBe('collapse');
    expect(st.floors.length).toBe(2);
    expect(st.floors[0].mat).toBe('mid');
    expect(st.floors[0].segs[0].hp).toBe(2); // 새 최하층은 온전
  });

  it('히트박스와 겹치는 가장 낮은 층만 타격', () => {
    const st = stack3();
    st.y = 100;
    // 히트박스 [0, 128] → 최하층(100~140)과 교차
    expect(damageStack(st, 0, 0, 128, 1)).toBe('hit');
    expect(st.floors[0].segs[0].hp).toBe(2);
    expect(st.floors[1].segs[0].hp).toBe(2); // 위층 무손상
    // 히트박스가 스택보다 아래 → miss
    expect(damageStack(st, 0, 0, 90, 1)).toBe('miss');
  });

  it('마천루 로비 HP10: 10타째에 붕괴', () => {
    const st = makeStack({
      variant: 'skyscraper', theme: 'modern',
      floors: [makeFloor('lobby')], y: 0,
    });
    for (let i = 0; i < 9; i++) expect(damageStack(st, 0, -1, 50, 1)).toBe('hit');
    expect(damageStack(st, 0, -1, 50, 1)).toBe('collapse'); // 10타째
  });

  it('낙하 물리: 종단속도 클램프 + 접지 감지', () => {
    const st = stack3();
    st.y = 5;
    st.vy = -1000;
    const grounded = stepStack(st, 900, 400, 1 / 60);
    expect(grounded).toBe(true);
    expect(st.y).toBe(0);
    expect(st.vy).toBeGreaterThanOrEqual(-400 - 15); // 클램프 후 적분
  });

  it('floorSpan: 층 수직 범위 누적', () => {
    const st = stack3();
    st.y = 10;
    const H = VIEW.FLOOR_H;
    expect(floorSpan(st, 0)).toEqual([10, 10 + H]);
    expect(floorSpan(st, 2)).toEqual([10 + 2 * H, 10 + 3 * H]);
  });
});

// ★09-05: 30% 재추첨이 HP만 바꾸고 mat은 base로 남겨 두던 결함의 회귀 가드.
// 렌더는 mat으로 타일을 고른다 — 등급과 HP가 어긋나면 화면이 거짓말을 한다.
describe('1막 스폰: 보이는 등급 = 실제 HP (09-05)', () => {
  it('시드·진행도를 갈아도 모든 층에서 MAT_HP[mat] === segs[0].maxHp', () => {
    const seen = new Set<string>();
    let floorCount = 0;
    for (const seed of [1, 7, 12345, 90210, 424242]) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const s = makeState({ seed });
        s.p = p;
        for (let n = 0; n < 40; n++) {
          spawnAct1Building(s);
          for (const f of s.stack!.floors) {
            expect(MAT_HP[f.mat]).toBe(f.segs[0].maxHp);
            expect(f.segs[0].hp).toBe(f.segs[0].maxHp); // 갓 스폰한 층은 온전하다
            seen.add(f.mat);
            floorCount += 1;
          }
          s.stack = null;
        }
      }
    }
    // 표본이 비어 있거나 한 등급뿐이면 위 단언은 아무것도 못 지킨다
    expect(floorCount).toBeGreaterThan(1000);
    expect(seen.size).toBe(3); // weak/mid/hard 셋 다 나왔다
  });
});
