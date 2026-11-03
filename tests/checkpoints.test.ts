// 체크포인트 산술 가드레일 — config 테이블 변경 시 즉시 깨진다.
// [정본] 30 → 40 → 148 → 168 → 180 → 220~230 → 달 230+
import { describe, it, expect } from 'vitest';
import { ACT2, BOSS, MAT_HP } from '../src/config';

describe('콤보 체크포인트 산술 (원작 정본)', () => {
  // 층 HP는 실제로 쓰는 MAT_HP에서 읽는다(makeFloor) — 11-03 전엔 아무도 안 읽는 ACT2 사본을 지켰다
  const cathedral = ACT2.CATHEDRAL_FLOORS * MAT_HP.cathedral;
  const lobby = cathedral + MAT_HP.lobby;
  const office = lobby + ACT2.TOWER_OFFICE_FLOORS * MAT_HP.office;
  const pent = office + MAT_HP.penthouse;
  const bolt = pent + ACT2.BOLT_COUNT;
  const rock = bolt + ACT2.ROCK_COUNT * ACT2.ROCK_HP;

  it('대성당 = 30', () => expect(cathedral).toBe(30));
  it('로비(잡념) = 40', () => expect(lobby).toBe(40));
  it('사무층(번뇌) = 148', () => expect(office).toBe(148));
  it('펜트하우스(불경기) = 168', () => expect(pent).toBe(168));
  it('번개 = 180', () => expect(bolt).toBe(180));
  it('화산탄 ∈ [220, 230]', () => {
    expect(rock).toBeGreaterThanOrEqual(220);
    expect(rock).toBeLessThanOrEqual(230);
  });
  it('본체 HP = 230 (원문 50+100+80)', () => expect(BOSS.HP).toBe(230));
  it('티어 임계 50/150', () => {
    expect(BOSS.TIER1_DMG).toBe(50);
    expect(BOSS.TIER2_DMG).toBe(150);
  });
});
