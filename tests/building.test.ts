// 건물 데이터 모델 규칙: 레인 세그먼트 독립 HP, 층 전체 붕괴, 밀어올림.
import { describe, it, expect } from 'vitest';
import { makeFloor, makeStack, damageStack, stepStack, floorSpan } from '../src/core/building';
import { VIEW } from '../src/config';

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
