// 메타 2차 개편 순수 로직 — 이달의 현장 · 첫 결제 선물 · 단골 도장 · 값어치 · 초 단위 타이머 · 공짜 커피 · 철거 대상
import { describe, expect, it } from 'vitest';
import {
  DUST_WON, EFF_MIN, FIRST_GIFT, ORBIT_WON, REGULAR_STEPS, SALARY_DAILY, SKUS, effPct, grantSku, regularReady, skuById, soldOut, stampsOf, takeRegular, worthWon, type Buyer,
} from '../src/meta/catalog';
import { DUST_EXCHANGE } from '../src/meta/economy';
import { packHtml, setPackTab, type OfferRow, type PackView } from '../src/ui/packView';
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

  it('앞당긴 달을 되돌린 뒤 산 특근 수당은 실제 달에 붙고 다음 달에 끝난다', () => {
    const b = buyer();
    rollSeason(b.season, '2026-12-02'); // 앞당김
    expect(grantSku(b, 'season_pass', 't9', '2026-11-20')).toBe(true);
    expect(b.season).toMatchObject({ key: '2026-11', pass: true });
    rollSeason(b.season, '2026-12-01');
    expect(b.season.pass).toBe(false);
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
    expect(worthWon(skuById('king_set')!)).toBe(16400); // 궤도조각 500 + 파는 꾸미기 여섯(240) + 마스크 10개 묶음 + 광고 없는 현장. 무기는 없다
  });

  it('특근은 갈 수 있는 칸만큼만 값을 말한다', () => {
    const pass = skuById('season_pass')!;
    expect(worthWon(pass, 5)).toBeLessThan(worthWon(pass));
    expect(worthWon(pass, 0)).toBe(0);
  });

  it('꾸러미마다 값이 가격보다 크다. 재화 묶음은 표시하지 않는다', () => {
    for (const id of ['rookie_pack', 'toolbox', 'salary', 'king_set', 'season_pass'] as const) {
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
    expect(effPct(skuById('king_set')!)).toBe(166);
    expect(effPct(skuById('season_pass')!)).toBe(212);
    expect(effPct(skuById('rookie_pack')!)).toBe(176);
    for (const id of ['no_ads', 'orbit_l', 'dust_l', 'mask_3'] as const) expect(effPct(skuById(id)!)).toBe(0);
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

describe('효율 값 표 — 열일곱 상품 (11-09 재정비)', () => {
  // 실행 출력으로 박은 값(tmp/overhaul/eff.ts). 재화 · 마스크 · 광고 없음 단품은 값 0(인장 없음).
  const TABLE: Record<string, [krw: number, worth: number, eff: number]> = {
    orbit_s: [900, 0, 0], dust_s: [900, 0, 0], mask_1: [900, 0, 0],
    rookie_sale: [900, 5100, 567], toolbox_sale: [900, 4300, 478],
    toolbox: [1900, 4300, 226], mask_3: [1900, 0, 0],
    rookie_pack: [2900, 5100, 176], no_ads: [2900, 0, 0], orbit_m: [2900, 0, 0], dust_m: [2900, 0, 0],
    salary: [4900, 33800, 690], season_pass: [4900, 10400, 212], orbit_l: [4900, 0, 0], dust_l: [4900, 0, 0], mask_10: [4900, 0, 0],
    king_set: [9900, 16400, 166],
  };

  it('열일곱 상품이 표와 한 줄도 어긋나지 않는다', () => {
    expect(SKUS.map((s) => s.id).sort()).toEqual(Object.keys(TABLE).sort());
    for (const s of SKUS) {
      const [krw, worth, eff] = TABLE[s.id];
      expect([s.krw, worthWon(s), Math.round((worthWon(s) / s.krw) * 100)], s.id).toEqual([krw, worth, eff]);
      expect(effPct(s), s.id).toBe(eff >= EFF_MIN ? eff : 0);
    }
  });

  it('철거왕 세트 = 파는 꾸미기 여섯(궤도조각 240) + 궤도조각 500 + 마스크 10개 + 광고 없음, 약 166%', () => {
    const orbit = (240 + 500) * ORBIT_WON;
    const mask = 10 * (skuById('mask_10')!.krw / 10);
    expect(worthWon(skuById('king_set')!)).toBe(Math.floor((orbit + mask + skuById('no_ads')!.krw) / 100) * 100);
    expect(effPct(skuById('king_set')!)).toBe(166);
  });
});

describe('가진 것은 값에서 뺀다', () => {
  const king = () => skuById('king_set')!;
  const SOLD_LOOKS = ['amber', 'slate', 'rebar', 'crescent', 'stamp', 'orbit']; // 궤도조각 40씩

  it('인자를 안 넘기면 값이 그대로다', () => {
    expect(worthWon(king())).toBe(worthWon(king(), RUNGS, {}));
    expect(worthWon(king())).toBe(worthWon(king(), RUNGS, { owned: [], noAds: false }));
  });

  it('이미 가진 꾸미기는 그 궤도조각 값(40)을 뺀다. 값이 없는 전용 꾸미기는 그대로', () => {
    expect(worthWon(king())).toBe(16400);
    expect(worthWon(king(), RUNGS, { owned: ['amber'] })).toBe(15900); // 740 - 40 = 700개분
    expect(worthWon(king(), RUNGS, { owned: SOLD_LOOKS })).toBe(13600); // 500개분 + 마스크 + 광고 없음
    expect(worthWon(king(), RUNGS, { owned: ['crown', 'royal', 'gilt', 'arc', 'rivet', 'coverall'] })).toBe(16400);
  });

  it('이미 받은 광고 없음은 광고 없는 현장 값을 뺀다', () => {
    expect(worthWon(king())).toBe(16400);
    expect(worthWon(king(), RUNGS, { noAds: true })).toBe(13500); // 16,400 - 2,900
    expect(worthWon(king(), RUNGS, { owned: SOLD_LOOKS, noAds: true })).toBe(10700);
    expect(effPct(king(), RUNGS, { owned: SOLD_LOOKS, noAds: true })).toBe(0); // 108% — 인장 없음(「전용」)
  });

  it('가진 것이 없는 상품은 안 바뀐다 — 재화 · 월급 · 도구함', () => {
    const have = { owned: SOLD_LOOKS, noAds: true };
    for (const id of ['toolbox', 'toolbox_sale', 'salary', 'orbit_l', 'mask_10'] as const) {
      expect(worthWon(skuById(id)!, RUNGS, have), id).toBe(worthWon(skuById(id)!));
    }
  });

  it('특근의 꾸미기 · 마스크는 가진 것을 빼도 값이 그대로다 (전용 꾸미기라 값이 0)', () => {
    const pass = skuById('season_pass')!;
    expect(worthWon(pass, RUNGS, { owned: ['s_night', 's_moon'], noAds: true })).toBe(worthWon(pass));
  });

  it('1회 상품은 가진 것을 뺀 값이 가격 밑이면 품절이다', () => {
    const k = king() as { krw: number };
    const real = k.krw;
    try {
      const have = { ...buyer(), owned: [...SOLD_LOOKS], noAds: true };
      expect(soldOut(have, 'king_set')).toBe(false); // 10,700 ≥ 9,900
      k.krw = 11000; // 가격을 올려 문턱을 넘긴다
      expect(soldOut(have, 'king_set')).toBe(true);
      expect(soldOut({ ...buyer(), owned: [], noAds: false }, 'king_set')).toBe(false); // 16,400 ≥ 11,000
    } finally {
      k.krw = real;
    }
  });

  it('철거왕 세트 · 신입 꾸러미 · 신입 특가는 꾸미기를 다 가져도 지금 값으론 품절이 아니다', () => {
    const all = SKUS.flatMap((s) => [...(s.owns ?? [])]);
    const rich = { ...buyer(), owned: all, noAds: true };
    for (const id of ['king_set', 'rookie_pack', 'rookie_sale'] as const) expect(soldOut(rich, id), id).toBe(false);
  });

  it('기존 품절 규칙은 그대로 — 특근 · 마스크 상한 · 짝 상품 · 광고 없는 현장', () => {
    const b = buyer();
    expect(soldOut({ ...b, noAds: true }, 'no_ads')).toBe(true);
    grantSku(b, 'rookie_sale', 't1');
    expect(soldOut(b, 'rookie_pack')).toBe(true);
    expect(soldOut({ ...buyer(), season: { ...emptySeason(), pass: true } }, 'season_pass')).toBe(true);
    expect(soldOut({ ...buyer(), masks: new Array(90).fill({}), blanks: 10 }, 'mask_1')).toBe(true);
  });
});

describe('꾸러미 탭 — 상품마다 한 탭 (11-09 재정비)', () => {
  const rows = (ids?: readonly string[]) =>
    SKUS.filter((s) => !s.sale && (!ids || ids.includes(s.id))).map((s) => ({ sku: s.id, title: s.title, price: `₩${s.krw}`, eff: 0 }));
  const view = (o: Partial<PackView> = {}): PackView => ({
    iap: true, offers: [], rows: rows(), bought: [], items: emptyItems(), orbit: 0, firstGift: true, coffeeOn: true,
    regular: { stamps: 0, got: 0 }, passGoods: {}, ...o,
  });
  const skusIn = (h: string): string[] => [...h.matchAll(/data-shop-sku="(\w+)"/g)].map((m) => m[1]);
  const tabIds = (h: string): string[] => [...h.matchAll(/data-pack-tab="(\w+)"/g)].map((m) => m[1]);
  const open = (id: string, v: PackView): string => { setPackTab(id); return packHtml(v); };
  const live = (sku: 'rookie_sale' | 'toolbox_sale', of: 'rookie_pack' | 'toolbox'): OfferRow => ({
    sku, of, title: '특가', price: '₩900', regular: '₩2,900', until: Date.now() + 3600_000, span: 3600_000, eff: 500,
  });

  it('탭은 넷 — 추천 · 단골 · 재화 · 소장', () => {
    expect(tabIds(open('hot', view()))).toEqual(['hot', 'regular', 'goods', 'own']);
    expect(open('hot', view())).toMatch(/aria-label="꾸러미 칸"/);
  });

  it('상품마다 한 탭에만 있다 — 추천은 지금 있는 것(신입 꾸러미)만 모아 보인다', () => {
    const seen = new Map<string, string[]>();
    for (const t of ['hot', 'regular', 'goods', 'own']) for (const id of skusIn(open(t, view()))) seen.set(id, [...(seen.get(id) ?? []), t]);
    expect([...seen.keys()].sort()).toEqual(SKUS.filter((s) => !s.sale).map((s) => s.id).sort());
    for (const [id, tabs] of seen) expect(tabs, id).toHaveLength(1);
    expect(seen.get('rookie_pack')).toEqual(['hot']);
    expect(seen.get('salary')).toEqual(['regular']);
    expect(seen.get('season_pass')).toEqual(['regular']);
    expect(seen.get('toolbox')).toEqual(['goods']);
    expect(seen.get('no_ads')).toEqual(['own']);
    expect(seen.get('king_set')).toEqual(['own']);
    for (const id of ['orbit_s', 'orbit_m', 'orbit_l', 'dust_s', 'dust_m', 'dust_l', 'mask_1', 'mask_3', 'mask_10']) expect(seen.get(id), id).toEqual(['goods']);
  });

  it('커피는 추천에만, 단골 도장은 단골에만, 구매 복원은 소장에만', () => {
    const v = view();
    expect(open('hot', v)).toContain('data-shop-coffee');
    for (const t of ['regular', 'goods', 'own']) expect(open(t, v), t).not.toContain('data-shop-coffee');
    expect(open('regular', v)).toContain('pk-reg');
    for (const t of ['hot', 'goods', 'own']) expect(open(t, v), t).not.toContain('pk-reg');
    expect(open('own', v)).toContain('data-shop-restore');
    for (const t of ['hot', 'regular', 'goods']) expect(open(t, v), t).not.toContain('data-shop-restore');
  });

  it('재화 탭 끝에 시작 장비 — 현장 도구함 패널 + 궤도조각 세 줄', () => {
    const h = open('goods', view());
    const at = h.indexOf('시작 장비');
    expect(at).toBeGreaterThan(h.indexOf('data-shop-sku="mask_10"'));
    expect(h.indexOf('data-shop-sku="toolbox"')).toBeGreaterThan(at);
    expect((h.match(/data-kit-buy="\w+"/g) ?? []).length).toBe(3);
    expect(h.indexOf('data-kit-buy')).toBeGreaterThan(h.indexOf('data-shop-sku="toolbox"'));
    for (const t of ['hot', 'regular', 'own']) expect(open(t, view()), t).not.toContain('data-kit-buy');
  });

  it('특가가 살아 있으면 추천에 특가 패널, 신입 꾸러미는 그 자리에서 빠진다', () => {
    const v = view({ offers: [live('rookie_sale', 'rookie_pack')] });
    const hot = skusIn(open('hot', v));
    expect(hot).toContain('rookie_sale');
    expect(hot).not.toContain('rookie_pack');
    expect(skusIn(open('goods', view({ offers: [live('toolbox_sale', 'toolbox')] })))).toContain('toolbox'); // 도구함 정가는 재화 탭에 늘 있다
  });

  it('추천이 비면 추천 탭을 숨긴다', () => {
    const v = view({ firstGift: false, coffeeOn: false, rows: rows().filter((r) => r.sku !== 'rookie_pack') });
    expect(tabIds(open('hot', v))).toEqual(['regular', 'goods', 'own']);
  });

  it('저장된 마지막 탭이 없어진 탭이면 첫 탭으로 간다', () => {
    const h = open('kit', view()); // 옛 「장비」 탭
    expect(h).toContain('aria-selected="true" class="pk-tab on" data-pack-tab="hot"');
    const gone = open('set', view({ firstGift: false, coffeeOn: false, rows: rows().filter((r) => r.sku !== 'rookie_pack') })); // 옛 「세트」 + 추천 없음
    expect(gone).toContain('aria-selected="true" class="pk-tab on" data-pack-tab="regular"');
  });

  it('결제 없는 판 — 커피와 시작 장비만, 탭 줄 없이', () => {
    const h = open('hot', view({ iap: false, rows: [], coffeeOn: true }));
    expect(h).not.toContain('data-pack-tab');
    expect(h).not.toContain('pk-tabs');
    expect(h).toContain('data-shop-coffee');
    expect((h.match(/data-kit-buy="\w+"/g) ?? []).length).toBe(3);
    expect(skusIn(h)).toEqual([]);
    expect(h).not.toContain('data-shop-restore');
  });

  it('소장 탭 — 둘 다 샀으면 빈 칸 대신 완료 인장 한 개, 복원은 그대로', () => {
    const h = open('own', view({ rows: rows().filter((r) => r.sku !== 'no_ads' && r.sku !== 'king_set') }));
    expect(skusIn(h)).toEqual([]);
    expect(h).toContain('pk-reg done');
    expect(h).toContain('data-shop-restore');
  });

  it('철거왕 세트 패널에 무기 칸이 없다', () => {
    const h = open('own', view());
    const king = h.slice(h.indexOf('data-scene="king_set"'));
    expect(king).not.toContain('swords');
    expect(king).toContain('꾸미기');
  });
});
