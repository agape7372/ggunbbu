// 메타 2차 개편 순수 로직 — 이달의 현장 · 첫 결제 선물 · 단골 도장 · 값어치 · 초 단위 타이머 · 공짜 커피 · 철거 대상
import { describe, expect, it } from 'vitest';
import {
  DUST_WON, EFF_MIN, FIRST_GIFT, ORBIT_WON, REGULAR_STEPS, SALARY_DAILY, SKUS, effPct, grantSku, regularReady, skuById, soldOut, stampsOf, takeRegular, worthWon, type Buyer,
} from '../src/meta/catalog';
import { DUST_EXCHANGE } from '../src/meta/economy';
import { emptyItems } from '../src/meta/kit';
import { clockText, emptyOffers, fuseLeft, liveOffers } from '../src/meta/offers';
import { DEMO_SITES, FREE_COFFEE, coffeeReady, demoSite, rewardText } from '../src/meta/progress';
import {
  LATE_DAYS, RUNGS, addReward, addSeasonPts, claimSeason, emptySeason, freeReward, paidReward, paidTotal, rollSeason, rungNeed, rungsOpen, rungsReach, seasonDaysLeft, seasonPtsOf, seasonTheme, validateSeason,
} from '../src/meta/season';
import { BLADE_IDS, BODY_IDS, LOOK_EARNED, sanitizeOwned } from '../src/meta/loadout';
import { COSMETIC_COLORS } from '../src/config';

const buyer = (): Buyer => ({
  dust: 0, orbit: 0, owned: [], blanks: 0, items: emptyItems(), bought: [], noAds: false, salary: { left: 0, key: '' }, iapTokens: [],
  season: emptySeason(), regular: { stamps: 0, got: 0 }, firstGift: false,
});

describe('이달의 현장', () => {
  it('달이 바뀌면 판을 새로 깔고, 되돌린 달로는 안 돌아간다', () => {
    const s = { ...emptySeason(), key: '2026-11', pts: 500, free: 3, paid: 2, pass: true };
    rollSeason(s, '2026-11-20');
    expect(s.pts).toBe(500);
    rollSeason(s, '2026-10-30');
    expect(s).toMatchObject({ key: '2026-11', pts: 500, pass: true });
    rollSeason(s, '2026-12-01');
    expect(s).toEqual({ ...emptySeason(), key: '2026-12' });
  });

  it('달이 바뀌면 열린 칸은 저절로 받는다 — 돈 낸 칸이 안 눌렀다고 사라지지 않는다', () => {
    const s = { ...emptySeason(), key: '2026-11', pts: rungNeed(14), free: 5, paid: 5, pass: true };
    const want = claimSeason({ ...s });
    expect(want?.orbit).toBeGreaterThan(0);
    expect(rollSeason(s, '2026-12-01')).toEqual(want);
    expect(rollSeason(s, '2026-12-20')).toBeNull();
    expect(rollSeason(emptySeason(), '2026-12-20')).toBeNull();
  });

  it('남은 날로 갈 수 있는 칸만 약속한다 — 오늘은 뺀다', () => {
    const s = { ...emptySeason(), key: '2026-11' };
    expect(rungsReach(s, '2026-11-10')).toBe(RUNGS);
    expect(rungsReach(s, '2026-11-20')).toBe(RUNGS); // 내일부터 열흘 × 두 배
    expect(rungsReach(s, '2026-11-21')).toBeLessThan(RUNGS);
    expect(rungsReach(s, '2026-11-28')).toBe(rungsOpen(105 * 2 * 2));
    expect(rungsReach(s, '2026-11-30')).toBe(0);
    expect(rungsReach({ ...s, pts: rungNeed(12) }, '2026-11-30')).toBe(12);
  });

  it('특근 줄 앞 몇 칸의 합 — 못 갈 칸의 꾸미기는 안 든다', () => {
    const t = seasonTheme('2026-11');
    expect(paidTotal(t, 10).orbit).toBeLessThan(paidTotal(t).orbit!);
    expect(paidTotal(t, 10).owns).toBeUndefined();
    expect(paidTotal(t, 15).owns).toEqual([t.body]);
    expect(paidTotal(t, 0)).toEqual({});
  });

  it('앞 칸은 빨리 열리고 끝 칸은 스무 날쯤 걸린다', () => {
    const perDay = 105; // 오늘 작업 넷 + 일당 둘 + 출근
    expect(rungsOpen(perDay)).toBe(2); // 첫날 두 칸
    expect(rungsOpen(perDay * 3)).toBeGreaterThanOrEqual(5);
    expect(rungsOpen(perDay * 19)).toBeLessThan(RUNGS);
    expect(rungsOpen(perDay * 20)).toBe(RUNGS);
    expect(rungsOpen(99_999)).toBe(RUNGS);
  });

  it('월말 열흘은 점수가 두 배다 — 늦게 온 사람도 완주한다', () => {
    const s = { ...emptySeason(), key: '2026-11' };
    expect(addSeasonPts(s, 10, '2026-11-20')).toBe(10);
    expect(addSeasonPts(s, 10, `2026-11-${30 - LATE_DAYS + 1}`)).toBe(20);
    expect(rungsOpen(105 * 2 * LATE_DAYS)).toBe(RUNGS);
  });

  it('특근 줄은 산 달에만 받는다. 산 뒤엔 열린 칸 몫을 한 번에 받는다', () => {
    const s = { ...emptySeason(), key: '2026-11', pts: rungNeed(3) };
    const free = claimSeason(s);
    expect(free).not.toBeNull();
    expect(s.free).toBe(3);
    expect(s.paid).toBe(0);
    expect(claimSeason(s)).toBeNull();
    s.pass = true;
    const paid = claimSeason(s);
    expect(paid?.orbit).toBeGreaterThan(0);
    expect(s.paid).toBe(3);
    expect(claimSeason(s)).toBeNull();
  });

  it('특근 줄 끝엔 그 달 전용 꾸미기가 있고, 판 능력치 상품은 없다', () => {
    for (const key of ['2026-11', '2026-12', '2027-01']) {
      const t = seasonTheme(key);
      expect(paidReward(RUNGS - 1, t).owns).toContain(t.blade);
      expect(paidReward(14, t).owns).toContain(t.body);
      expect(BLADE_IDS).toContain(t.blade);
      expect(BODY_IDS).toContain(t.body);
      expect(COSMETIC_COLORS.blade[t.blade]).toBeTruthy();
      expect(COSMETIC_COLORS.body[t.body]).toBeTruthy();
      expect(LOOK_EARNED[t.blade]?.name).toBeTruthy();
      expect(LOOK_EARNED[t.body]?.name).toBeTruthy();
    }
    for (let i = 0; i < RUNGS; i++) {
      const r = freeReward(i);
      expect(Boolean(r.dust || r.orbit || r.items || r.masks)).toBe(true);
    }
  });

  it('특근 줄 합계는 문서와 같고, 산 달에 첫 칸이 크다', () => {
    const t = seasonTheme('2026-11');
    const all = paidTotal(t);
    const kits = (all.items?.life ?? 0) + (all.items?.waza ?? 0) + (all.items?.dust2x ?? 0);
    expect(all.orbit).toBe(555);
    expect(kits).toBe(10);
    expect(all.masks).toBe(2);
    expect(all.owns).toEqual([t.body, t.blade]);
    expect(paidReward(0, t).orbit).toBeGreaterThanOrEqual(60);
  });

  it('보상을 합친다 — 없는 칸을 만들지 않는다', () => {
    expect(addReward(addReward(null, { dust: 10, items: { waza: 1 } }), { orbit: 5, items: { waza: 2, life: 1 }, owns: ['x'] }))
      .toEqual({ dust: 10, orbit: 5, items: { waza: 3, life: 1 }, owns: ['x'] });
  });

  it('남은 날을 달 끝까지 센다', () => {
    expect(seasonDaysLeft('2026-11-30')).toBe(1);
    expect(seasonDaysLeft('2026-11-01')).toBe(30);
    expect(seasonDaysLeft('2026-02-01')).toBe(28);
  });

  it('미션 난이도마다 점수가 다르다', () => {
    expect(seasonPtsOf(0)).toBeLessThan(seasonPtsOf(1));
    expect(seasonPtsOf(1)).toBeLessThan(seasonPtsOf(2));
    expect(seasonPtsOf(0) + seasonPtsOf(1) * 2 + seasonPtsOf(2)).toBe(65);
  });

  it('저장 검증 — 깨진 값은 빈 판, 칸 수는 상한 안', () => {
    expect(validateSeason(null)).toEqual(emptySeason());
    expect(validateSeason({ key: 'abc', pts: 5 })).toEqual({ ...emptySeason(), pts: 5 });
    expect(validateSeason({ key: '2026-11', pts: -4, free: 99, paid: 2, pass: 'y' })).toEqual({ ...emptySeason(), key: '2026-11', free: RUNGS, paid: 2 });
  });
});

describe('특근 수당 · 첫 결제 선물', () => {
  it('특근 수당은 그 달 줄을 연다. 같은 달엔 품절, 다음 달엔 다시 판다', () => {
    const b = buyer();
    b.season.key = '2026-11';
    expect(soldOut(b, 'season_pass')).toBe(false);
    expect(grantSku(b, 'season_pass', 't1')).toBe(true);
    expect(b.season.pass).toBe(true);
    expect(soldOut(b, 'season_pass')).toBe(true);
    rollSeason(b.season, '2026-12-01');
    expect(soldOut(b, 'season_pass')).toBe(false);
  });

  it('오늘 사도 값이 가격에 못 미치면 특근을 안 판다', () => {
    const b = buyer();
    b.season.key = '2026-11';
    expect(soldOut(b, 'season_pass', '2026-11-10')).toBe(false);
    expect(soldOut(b, 'season_pass', '2026-11-28')).toBe(true);
    b.season.pts = rungNeed(20); // 많이 열어 뒀으면 달 끝에도 값을 한다
    expect(soldOut(b, 'season_pass', '2026-11-28')).toBe(false);
  });

  it('남은 칸보다 큰 마스크 묶음은 안 판다', () => {
    const b = { ...buyer(), masks: Array.from({ length: 95 }), blanks: 0 };
    expect(soldOut(b, 'mask_10')).toBe(true);
    expect(soldOut(b, 'mask_3')).toBe(false);
    expect(soldOut({ ...b, blanks: 3 }, 'mask_3')).toBe(true);
  });

  it('첫 결제면 어떤 상품이든 선물이 한 번 붙는다', () => {
    const b = buyer();
    expect(grantSku(b, 'mask_1', 't1')).toBe(true);
    expect(b.firstGift).toBe(true);
    expect(b.orbit).toBe(FIRST_GIFT.orbit);
    expect(b.owned).toEqual(expect.arrayContaining([...FIRST_GIFT.owns]));
    grantSku(b, 'mask_1', 't2');
    expect(b.orbit).toBe(FIRST_GIFT.orbit);
  });

  it('같은 토큰으로는 선물도 도장도 두 번 안 붙는다', () => {
    const b = buyer();
    grantSku(b, 'toolbox', 't1');
    const stamps = b.regular.stamps;
    expect(grantSku(b, 'toolbox', 't1')).toBe(false);
    expect(b.regular.stamps).toBe(stamps);
    expect(b.orbit).toBe(FIRST_GIFT.orbit);
  });
});

describe('단골 도장', () => {
  it('₩900마다 도장 하나', () => {
    expect(stampsOf(900)).toBe(1);
    expect(stampsOf(1900)).toBe(2);
    expect(stampsOf(2900)).toBe(3);
    expect(stampsOf(4900)).toBe(5);
    expect(stampsOf(9900)).toBe(11);
  });

  it('칸이 차면 차례로 받는다', () => {
    const b = buyer();
    expect(regularReady(b.regular)).toBe(-1);
    b.regular.stamps = REGULAR_STEPS[0].at;
    expect(regularReady(b.regular)).toBe(0);
    const r = takeRegular(b.regular);
    expect(r).toEqual(REGULAR_STEPS[0].reward);
    expect(b.regular.got).toBe(1);
    expect(takeRegular(b.regular)).toBeNull();
    b.regular.stamps = 99;
    expect(takeRegular(b.regular)).toEqual(REGULAR_STEPS[1].reward);
    expect(takeRegular(b.regular)).toEqual(REGULAR_STEPS[2].reward);
    expect(takeRegular(b.regular)).toBeNull();
  });
});

describe('값어치 · 효율', () => {
  it('궤도조각은 가장 싼 묶음 단가로 잰다', () => {
    expect(ORBIT_WON).toBe(skuById('orbit_l')!.krw / skuById('orbit_l')!.orbit!);
    for (const id of ['orbit_s', 'orbit_m'] as const) expect(skuById(id)!.krw / skuById(id)!.orbit!).toBeGreaterThan(ORBIT_WON);
  });

  it('먼지도 가장 싼 묶음 단가로 잰다', () => {
    expect(DUST_WON).toBe(skuById('dust_l')!.krw / skuById('dust_l')!.dust!);
    for (const id of ['dust_s', 'dust_m'] as const) expect(skuById(id)!.krw / skuById(id)!.dust!).toBeGreaterThan(DUST_WON);
  });

  it('먼지를 사서 궤도조각으로 바꿔도 같은 값 궤도조각 묶음보다 이득이 없다', () => {
    const rate = DUST_EXCHANGE.dust / DUST_EXCHANGE.orbit;
    for (const [d, o] of [['dust_s', 'orbit_s'], ['dust_m', 'orbit_m'], ['dust_l', 'orbit_l']] as const) {
      expect(skuById(d)!.krw).toBe(skuById(o)!.krw);
      expect(skuById(d)!.dust! / rate).toBeLessThanOrEqual(skuById(o)!.orbit!);
    }
  });

  it('따로 파는 것만 더한다 — 전용 꾸미기 · 기본 무기는 값에 안 든다', () => {
    expect(worthWon(skuById('rookie_pack')!)).toBe(5100); // 궤도조각 120 + 장비 225 + 먼지 1,000
    expect(worthWon(skuById('knight_set')!)).toBe(5200); // 궤도조각 450, 전용 꾸미기 둘은 0
    expect(worthWon(skuById('king_set')!)).toBe(22300); // 파는 꾸미기 여섯 + 마스크 10개 묶음 + 광고 없는 현장 + 무기 먼지값
  });

  it('특근은 갈 수 있는 칸만큼만 값을 말한다', () => {
    const pass = skuById('season_pass')!;
    expect(worthWon(pass, 5)).toBeLessThan(worthWon(pass));
    expect(worthWon(pass, 0)).toBe(0);
  });

  it('꾸러미마다 값이 가격보다 크다. 재화 묶음은 표시하지 않는다', () => {
    for (const id of ['rookie_pack', 'toolbox', 'salary', 'knight_set', 'king_set', 'season_pass'] as const) {
      const sku = skuById(id)!;
      expect(worthWon(sku)).toBeGreaterThan(sku.krw);
    }
    expect(worthWon(skuById('orbit_m')!)).toBe(0);
    expect(worthWon(skuById('dust_m')!)).toBe(0);
    expect(worthWon(skuById('mask_3')!)).toBe(0);
    expect(worthWon(skuById('no_ads')!)).toBe(0);
  });

  it('효율 = 값 ÷ 가격. 문턱 밑은 인장을 안 찍는다', () => {
    expect(effPct(skuById('salary')!)).toBe(690);
    expect(effPct(skuById('toolbox_sale')!)).toBe(478);
    expect(effPct(skuById('rookie_sale')!)).toBe(567);
    expect(effPct(skuById('toolbox')!)).toBe(226);
    expect(effPct(skuById('king_set')!)).toBe(225);
    expect(effPct(skuById('season_pass')!)).toBe(212);
    expect(effPct(skuById('rookie_pack')!)).toBe(176);
    for (const id of ['knight_set', 'no_ads', 'orbit_l', 'dust_l', 'mask_3'] as const) expect(effPct(skuById(id)!)).toBe(0);
  });

  it('특근 효율은 갈 수 있는 칸까지만', () => {
    const pass = skuById('season_pass')!;
    expect(worthWon(pass, 20)).toBeLessThan(worthWon(pass));
    expect(effPct(pass, 26)).toBeGreaterThanOrEqual(EFF_MIN);
    expect(effPct(pass, 26)).toBeLessThan(effPct(pass));
    expect(effPct(pass, 5)).toBe(0);
  });

  it('월급 봉투 = ₩4,900 · 매일 목숨 · 필살 · 먼지 2배 · 값 ₩33,800', () => {
    const sku = skuById('salary')!;
    expect(sku.krw).toBe(4900);
    expect(sku.orbit).toBe(200);
    expect(SALARY_DAILY).toEqual({ orbit: 15, items: { life: 1, waza: 1, dust2x: 1 } });
    expect(worthWon(sku)).toBe(33800);
  });

  it('100원 단위로 내림', () => {
    for (const s of SKUS) expect(worthWon(s) % 100).toBe(0);
  });
});

describe('초 단위 타이머 · 도화선', () => {
  it('시:분:초', () => {
    const now = 1_000_000;
    expect(clockText(now + 3_600_000 * 31 + 61_000, now)).toBe('31:01:01');
    expect(clockText(now + 9_000, now)).toBe('00:00:09');
    expect(clockText(now - 5, now)).toBe('00:00:00');
  });

  it('도화선은 남은 비율, 특가마다 길이를 안다', () => {
    const o = emptyOffers();
    const t = Date.UTC(2026, 10, 10, 3);
    o.rookieUntil = t + 12 * 3_600_000;
    const live = liveOffers(o, [], t)[0];
    expect(live.span).toBe(48 * 3_600_000);
    expect(fuseLeft(live, t)).toBeCloseTo(0.25);
    expect(fuseLeft(live, t + 99 * 3_600_000)).toBe(0);
  });
});

describe('공짜 커피 · 오늘의 철거 대상', () => {
  it('하루 한 잔', () => {
    expect(coffeeReady('', '2026-11-01')).toBe(true);
    expect(coffeeReady('2026-11-01', '2026-11-01')).toBe(false);
    expect(coffeeReady('2026-11-01', '2026-11-02')).toBe(true);
    expect(rewardText(FREE_COFFEE)).toContain('먼지');
  });

  it('날짜로 정해지고 대상이 고르게 바뀐다', () => {
    const a = demoSite('2026-11-01');
    expect(demoSite('2026-11-01')).toEqual(a);
    const names = new Set(Array.from({ length: 28 }, (_, d) => demoSite(`2026-11-${String(d + 1).padStart(2, '0')}`).name));
    expect(names.size).toBeGreaterThan(DEMO_SITES.length / 2);
  });
});

describe('새 꾸미기 저장', () => {
  it('sanitizeOwned가 새 꾸미기를 지우지 않는다', () => {
    const ids = [...FIRST_GIFT.owns, ...REGULAR_STEPS.flatMap((s) => s.reward.owns ?? [])];
    expect(ids.length).toBeGreaterThan(1);
    expect(sanitizeOwned(ids)).toEqual(expect.arrayContaining(ids));
  });
});
