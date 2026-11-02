// 메타 개편 순수 로직 — 시작 장비 · 상품 지급 · 특가 · 출근부 · 일당 · 신입 과제 · 실적 · 저장
import { beforeEach, describe, expect, it } from 'vitest';
import { advance, applyStartKit, makeState } from '../src/core/sim';
import { PLAYER, WAZA_GAUGE } from '../src/config';
import { addItems, buyKit, clampPick, emptyItems, isBare, kitSheetUseful, pickCount, spendKit, validateItems } from '../src/meta/kit';
import { dustOf, grantSku, orbitOf, SKUS, skuById, soldOut, TOKEN_KEEP, type Buyer } from '../src/meta/catalog';
import { armOffers, clockOf, emptyOffers, leftText, liveOffers, noteOfferBought, offerClock, offerToPop } from '../src/meta/offers';
import {
  ACHIEVES, DAILY_POOL, DAILY_PICK, TRACK_BY_ID, applyMissionEvent, ensureDaily, initAchieveProgress, kstDateKey, mergeAchieves, nextRollover, pickDailyIds,
} from '../src/meta/missions';
import {
  ATTEND, achieveLines, attendReady, claimAttend, claimSalary, claimWage, factsOf, giveReward, rewardText, ROOKIE, ROOKIE_TITLE,
  rookieReady, salaryAdFree, salaryReady, syncAchieves, titlesOf, validateSalary, wageReady, wageReward, type Facts,
} from '../src/meta/progress';
import { emptySeason } from '../src/meta/season';
import { adOrbitLeft, noteAdOrbit, AD_ORBIT_DAILY } from '../src/meta/economy';
import { BLADE_IDS, BODY_IDS, LETTERS_IDS, LOOK_EARNED, sanitizeOwned, WEAPON_IDS } from '../src/meta/loadout';
import { COSMETIC_COLORS } from '../src/config';
import { DEFAULT_SAVE, loadSave, saveSave } from '../src/storage';
import { SAVE_KEY } from '../src/config';

const HOUR = 3600_000;
const T0 = Date.UTC(2026, 10, 10, 3); // 11월 10일 12시 KST — 월초 아님

function buyer(): Buyer {
  return {
    dust: 0, orbit: 0, owned: [], blanks: 0, items: emptyItems(), bought: [], noAds: false, salary: { left: 0, key: '' }, iapTokens: [],
    season: emptySeason(), regular: { stamps: 0, got: 0 }, firstGift: true,
  };
}

describe('시작 장비', () => {
  it('보유와 한 판 상한으로 자르고 0은 뺀다', () => {
    const items = { life: 1, waza: 9, dust2x: 0 };
    expect(clampPick({ life: 2, waza: 9, dust2x: 1 }, items)).toEqual({ life: 1, waza: 3 });
    expect(pickCount({ life: 1, waza: 3 })).toBe(4);
    expect(clampPick({ life: -1 }, items)).toEqual({});
  });

  it('고른 만큼만 빠진다', () => {
    const items = { life: 3, waza: 2, dust2x: 1 };
    spendKit(items, clampPick({ life: 2, dust2x: 1 }, items));
    expect(items).toEqual({ life: 1, waza: 2, dust2x: 0 });
  });

  it('궤도조각으로 산다. 모자라면 지갑 불변', () => {
    const inv = { orbit: 29, items: emptyItems() };
    expect(buyKit(inv, 'life')).toBe(false);
    expect(inv.orbit).toBe(29);
    inv.orbit = 30;
    expect(buyKit(inv, 'life')).toBe(true);
    expect(inv).toEqual({ orbit: 0, items: { life: 1, waza: 0, dust2x: 0 } });
  });

  it('고를 것도 살 것도 없으면 시트를 안 띄운다', () => {
    expect(kitSheetUseful(emptyItems(), 19)).toBe(false);
    expect(kitSheetUseful(emptyItems(), 20)).toBe(true);
    expect(kitSheetUseful({ life: 1, waza: 0, dust2x: 0 }, 0)).toBe(true);
  });

  it('먼지 자루만 들면 맨손이다', () => {
    expect(isBare({ dust2x: 1 })).toBe(true);
    expect(isBare({ life: 1 })).toBe(false);
  });

  it('core 주입 — 목숨이 늘고 필살은 쓴 만큼 다시 찬다', () => {
    const s = makeState({ seed: 1 });
    applyStartKit(s, 2, 3);
    expect(s.lives).toBe(PLAYER.LIVES + 2);
    expect(s.wazaGauge).toBe(WAZA_GAUGE.MAX);
    expect(s.wazaBank).toBe(2);
    s.wazaGauge = 0; // 필살을 쓴 자리
    const idle = { jump: false, guard: false, attack: false, special: false, left: false, right: false } as never;
    advance(s, idle);
    expect(s.wazaGauge).toBe(WAZA_GAUGE.MAX);
    expect(s.wazaBank).toBe(1);
  });

  it('장비가 없으면 게이지를 안 건드린다 — 기본 판 재생 불변', () => {
    const s = makeState({ seed: 1 });
    expect(s.wazaBank).toBe(0);
    applyStartKit(s, 0, 0);
    expect(s.wazaGauge).toBe(0);
    expect(s.lives).toBe(PLAYER.LIVES);
  });
});

describe('상품 지급', () => {
  it('가격은 900원부터 단계로 오른다', () => {
    const prices = [...new Set(SKUS.map((s) => s.krw))].sort((a, b) => a - b);
    expect(prices).toEqual([900, 1900, 2900, 4900, 9900]);
  });

  it('같은 토큰은 두 번 안 준다', () => {
    const b = buyer();
    expect(grantSku(b, 'toolbox', 't1')).toBe(true);
    expect(grantSku(b, 'toolbox', 't1')).toBe(false);
    expect(b.items).toEqual({ life: 5, waza: 5, dust2x: 5 });
  });

  it('궤도조각 묶음은 그 상품 첫 구매만 두 배다', () => {
    const b = buyer();
    expect(orbitOf(skuById('orbit_s')!, b.bought)).toBe(120);
    grantSku(b, 'orbit_s', 't1');
    grantSku(b, 'orbit_s', 't2');
    expect(b.orbit).toBe(180);
    grantSku(b, 'orbit_m', 't3');
    expect(b.orbit).toBe(180 + 440);
  });

  it('먼지 묶음도 그 상품 첫 구매만 두 배다', () => {
    const b = buyer();
    expect(dustOf(skuById('dust_s')!, b.bought)).toBe(1200);
    grantSku(b, 'dust_s', 't1');
    expect(b.dust).toBe(1200);
    expect(dustOf(skuById('dust_s')!, b.bought)).toBe(600);
    grantSku(b, 'dust_s', 't2');
    grantSku(b, 'dust_m', 't3');
    expect(b.dust).toBe(1800 + 4400);
    expect(soldOut(b, 'dust_s')).toBe(false);
  });

  it('신입 특가를 사면 정가 꾸러미도 품절이다', () => {
    const b = buyer();
    expect(soldOut(b, 'rookie_pack')).toBe(false);
    grantSku(b, 'rookie_sale', 't1');
    expect(b.owned).toContain('coverall');
    expect(soldOut(b, 'rookie_pack')).toBe(true);
    expect(soldOut(b, 'rookie_sale')).toBe(true);
  });

  it('철거왕 세트는 무기 전부와 광고 없는 현장을 주고 실적 전용 꾸미기는 안 판다', () => {
    const b = buyer();
    grantSku(b, 'king_set', 't1');
    expect(b.noAds).toBe(true);
    expect(soldOut(b, 'no_ads')).toBe(true);
    for (const id of WEAPON_IDS.filter((w) => w !== 'sword')) expect(b.owned).toContain(id);
    for (const id of ['ash', 'ember', 'sprout']) expect(b.owned).not.toContain(id);
    expect(b.blanks).toBe(10);
  });

  it('마스크 묶음은 살 때마다 수량만큼 쌓인다', () => {
    const b = buyer();
    grantSku(b, 'mask_1', 't1');
    grantSku(b, 'mask_3', 't2');
    grantSku(b, 'mask_3', 't3');
    grantSku(b, 'mask_10', 't4');
    expect(b.blanks).toBe(17);
    expect(soldOut(b, 'mask_3')).toBe(false);
  });

  it('가면이 상한(가진 장 + 남은 칸)에 닿으면 마스크 묶음은 품절이다', () => {
    const b = { ...buyer(), masks: Array.from({ length: 90 }, () => ({})), blanks: 9 };
    expect(soldOut(b, 'mask_1')).toBe(false);
    b.blanks = 10;
    expect(soldOut(b, 'mask_1')).toBe(true);
    expect(soldOut(b, 'mask_10')).toBe(true);
    expect(soldOut(b, 'orbit_s')).toBe(false);
    expect(soldOut(b, 'king_set')).toBe(false); // 무기 · 꾸미기가 함께라 마스크 상한으로 막지 않는다
  });

  it('월급 봉투는 칸을 더한다', () => {
    const b = buyer();
    grantSku(b, 'salary', 't1');
    grantSku(b, 'salary', 't2');
    expect(b.salary.left).toBe(60);
    expect(b.orbit).toBe(400);
  });

  it('월급의 광고 없음은 달력으로 끝나고, 더 사면 남은 날 뒤에 붙는다', () => {
    const b = buyer();
    grantSku(b, 'salary', 't1', '2026-11-02');
    expect(b.salary.adUntil).toBe('2026-12-02');
    expect(salaryAdFree(b.salary, '2026-12-01')).toBe(true);
    expect(salaryAdFree(b.salary, '2026-12-02')).toBe(false);
    grantSku(b, 'salary', 't2', '2026-11-10');
    expect(b.salary.adUntil).toBe('2027-01-01');
    grantSku(b, 'salary', 't3', '2027-03-01'); // 끝난 뒤에 사면 오늘부터
    expect(b.salary.adUntil).toBe('2027-03-31');
  });

  it('안 받은 칸이 남아도 30일이 지나면 광고가 돌아온다', () => {
    const b = buyer();
    grantSku(b, 'salary', 't1', '2026-11-02');
    expect(b.salary.left).toBe(30);
    expect(salaryAdFree(b.salary, '2027-05-01')).toBe(false);
    expect(salaryReady(b.salary, '2027-05-01')).toBe(true); // 칸은 그대로 받는다
  });

  it('광고 없음 날짜는 저장을 지나도 남고, 옛 저장엔 없다', () => {
    expect(validateSalary({ left: 3, key: 'a', adUntil: '2026-12-02' })).toEqual({ left: 3, key: 'a', adUntil: '2026-12-02' });
    expect(validateSalary({ left: 3, key: 'a' })).toEqual({ left: 3, key: 'a' });
    expect(salaryAdFree({ left: 3, key: 'a' }, '2026-11-02')).toBe(false);
  });

  it('남은 시간은 다음 05:00 KST까지', () => {
    expect(nextRollover(T0)).toBe(Date.UTC(2026, 10, 10, 20)); // 12시 KST → 이튿날 05시 KST
    const at = Date.UTC(2026, 10, 10, 20);
    expect(nextRollover(at)).toBe(at + 24 * HOUR); // 막 바뀐 순간은 하루 뒤
    expect(kstDateKey(nextRollover(T0) - 1)).not.toBe(kstDateKey(nextRollover(T0)));
  });

  it('토큰 목록은 상한을 넘지 않는다', () => {
    const b = buyer();
    for (let i = 0; i < TOKEN_KEEP + 5; i++) grantSku(b, 'toolbox', `t${i}`);
    expect(b.iapTokens.length).toBe(TOKEN_KEEP);
  });

  it('상품이 주는 꾸미기는 전부 저장을 지나간다 — 빠지면 산 것이 다음 불러오기에서 지워진다', () => {
    const all = SKUS.flatMap((s) => [...(s.owns ?? [])]);
    expect(sanitizeOwned(all).sort()).toEqual([...new Set(all)].sort());
  });
});

describe('꾸미기 표', () => {
  it('새 꾸미기는 색과 이름이 다 있다', () => {
    for (const id of Object.keys(LOOK_EARNED)) {
      const slot = BODY_IDS.includes(id as never) ? 'body' : BLADE_IDS.includes(id as never) ? 'blade' : LETTERS_IDS.includes(id as never) ? 'letters' : null;
      expect(slot).not.toBeNull();
      expect(COSMETIC_COLORS[slot!][id]).toMatch(/^#/);
    }
  });
});

describe('특가', () => {
  it('둘째 판 뒤에 열리고 48시간 뒤 닫힌다', () => {
    const o = emptyOffers();
    armOffers(o, { runs: 1, reachedAct2: false }, T0);
    expect(liveOffers(o, [], T0)).toEqual([]);
    armOffers(o, { runs: 2, reachedAct2: false }, T0);
    expect(liveOffers(o, [], T0).map((x) => x.id)).toEqual(['rookie']);
    expect(liveOffers(o, [], T0 + 47 * HOUR).length).toBe(1);
    expect(liveOffers(o, [], T0 + 48 * HOUR)).toEqual([]);
  });

  it('끝난 특가는 다시 안 열린다', () => {
    const o = emptyOffers();
    armOffers(o, { runs: 2, reachedAct2: false }, T0);
    const until = o.rookieUntil;
    armOffers(o, { runs: 9, reachedAct2: false }, T0 + 100 * HOUR);
    expect(o.rookieUntil).toBe(until);
    expect(liveOffers(o, [], T0 + 100 * HOUR)).toEqual([]);
  });

  it('시계를 되돌려도 살아나지 않는다', () => {
    const o = emptyOffers();
    armOffers(o, { runs: 2, reachedAct2: false }, T0);
    clockOf(o, T0 + 50 * HOUR);
    expect(liveOffers(o, [], T0)).toEqual([]);
  });

  it('샀으면 사라진다', () => {
    const o = emptyOffers();
    armOffers(o, { runs: 2, reachedAct2: false }, T0);
    expect(liveOffers(o, ['rookie_pack'], T0)).toEqual([]);
  });

  it('월초 특가는 1~3일만, 달마다 한 번이다', () => {
    const o = emptyOffers();
    const d2 = Date.UTC(2026, 10, 2, 3);
    expect(liveOffers(o, [], d2).map((x) => x.id)).toEqual(['month']);
    expect(liveOffers(o, [], Date.UTC(2026, 10, 4, 3))).toEqual([]);
    noteOfferBought(o, 'toolbox_sale', d2);
    expect(liveOffers(o, [], d2)).toEqual([]);
    expect(liveOffers(o, [], Date.UTC(2026, 11, 1, 3)).map((x) => x.id)).toEqual(['month']);
  });

  it('시계를 되돌린 동안은 특가를 숨기고, 남은 시간은 본 시각 기준이다', () => {
    const o = emptyOffers();
    armOffers(o, { runs: 2, reachedAct2: false }, T0);
    clockOf(o, T0 + 30 * HOUR);
    expect(liveOffers(o, [], T0 + 30 * HOUR).length).toBe(1);
    expect(liveOffers(o, [], T0)).toEqual([]); // 30시간 되돌림
    expect(liveOffers(o, [], T0 + 30 * HOUR - 60_000).length).toBe(1); // 몇 분 보정은 봐준다
    expect(offerClock(o, T0)).toBe(T0 + 30 * HOUR);
    expect(leftText(o.rookieUntil, offerClock(o, T0))).toBe('18시간 0분 남음');
    expect(liveOffers(o, [], T0 + 48 * HOUR)).toEqual([]); // 타이머는 실제로 끝난다
  });

  it('끝난 뒤 늦게 복구된 고비 특가는 월초 특가를 닫지 않는다', () => {
    const o = emptyOffers();
    const d10 = Date.UTC(2026, 10, 10, 3);
    o.rescueUntil = d10 - HOUR; // 이미 끝남
    noteOfferBought(o, 'toolbox_sale', d10);
    expect(o.monthBought).toBe('');
    const d2 = Date.UTC(2026, 10, 2, 3);
    const m = emptyOffers();
    noteOfferBought(m, 'toolbox_sale', d2); // 월초에 산 것만 이달을 닫는다
    expect(m.monthBought).toBe('2026-11');
  });

  it('고비 특가를 사면 고비 특가가 닫힌다', () => {
    const o = emptyOffers();
    armOffers(o, { runs: 1, reachedAct2: true }, T0);
    expect(liveOffers(o, [], T0).map((x) => x.id)).toEqual(['rescue']);
    noteOfferBought(o, 'toolbox_sale', T0);
    expect(liveOffers(o, [], T0)).toEqual([]);
  });

  it('고비 특가와 월초 특가가 겹치면 하나만 보인다', () => {
    const o = emptyOffers();
    const d2 = Date.UTC(2026, 10, 2, 3);
    armOffers(o, { runs: 1, reachedAct2: true }, d2);
    expect(liveOffers(o, [], d2).map((x) => x.id)).toEqual(['rescue']);
  });

  it('오퍼 창은 하루 한 번이다', () => {
    const o = emptyOffers();
    armOffers(o, { runs: 2, reachedAct2: false }, T0);
    expect(offerToPop(o, [], T0, '2026-11-10', 2)?.id).toBe('rookie');
    expect(offerToPop(o, [], T0, '2026-11-10', 1)).toBeNull(); // 한 판도 덜 한 사람에게는 안 내민다
    o.popDay = '2026-11-10';
    expect(offerToPop(o, [], T0, '2026-11-10', 2)).toBeNull();
  });

  it('남은 시간 표기', () => {
    expect(leftText(T0 + 2 * HOUR + 60_000, T0)).toBe('2시간 1분 남음');
    expect(leftText(T0 + 59 * 60_000, T0)).toBe('59분 남음');
  });
});

describe('일일 네 칸', () => {
  const keys = Array.from({ length: 60 }, (_, i) => `2026-09-${String((i % 28) + 1).padStart(2, '0')}#${i}`);
  const tierOf = (id: string): number | undefined => DAILY_POOL.find((d) => d.id === id)?.tier;

  it('쉬움 1 · 보통 2 · 도전 1', () => {
    for (const k of keys) {
      for (const [ad, reached] of [[true, 3], [false, 0]] as const) {
        const ids = pickDailyIds(k, ad, reached);
        expect(ids.length).toBe(DAILY_PICK);
        expect(new Set(ids).size).toBe(DAILY_PICK);
        expect(ids.map(tierOf)).toEqual([0, 1, 1, 2]);
      }
    }
  });

  it('모든 일일 미션이 트랙과 난이도를 가진다', () => {
    for (const d of DAILY_POOL) {
      expect(TRACK_BY_ID[d.id]).toBeTruthy();
      expect(d.tier).toBeDefined();
    }
  });

  it('시계를 되돌려도 새로 안 뽑는다', () => {
    const today = ensureDaily(null, Date.UTC(2026, 10, 10, 3));
    expect(ensureDaily(today, Date.UTC(2026, 10, 9, 3))).toBe(today);
    expect(ensureDaily(today, Date.UTC(2026, 10, 11, 3)).dateKey).toBe('2026-11-11');
  });

  it('새 트랙이 이벤트를 받는다', () => {
    const daily = { dateKey: 'x', items: [{ id: 'guard_5', count: 0, claimed: false }, { id: 'play_2', count: 0, claimed: false }, { id: 'stage_clear', count: 0, claimed: false }] };
    const ach = initAchieveProgress();
    applyMissionEvent(daily, ach, { kind: 'guardBounce' });
    applyMissionEvent(daily, ach, { kind: 'guardAirBounce' });
    applyMissionEvent(daily, ach, { kind: 'runStart' });
    applyMissionEvent(daily, ach, { kind: 'stageClear' });
    applyMissionEvent(daily, ach, { kind: 'bareMoon' });
    expect(daily.items.map((p) => p.count)).toEqual([2, 1, 1]);
    expect(ach.find((p) => p.id === 'bare_moon')?.count).toBe(1);
  });
});

describe('출근부 · 일당 · 월급', () => {
  it('하루 한 칸, 끊겨도 이어서, 일곱째가 가장 크다', () => {
    const a = { step: 0, key: '' };
    expect(claimAttend(a, '2026-11-01')).toEqual(ATTEND[0]);
    expect(claimAttend(a, '2026-11-01')).toBeNull();
    expect(claimAttend(a, '2026-11-09')).toEqual(ATTEND[1]); // 여드레를 빠져도 다음 칸
    expect(attendReady(a, '2026-11-08')).toBe(false); // 시계를 되돌려도 못 받는다
    a.step = 6;
    expect(claimAttend(a, '2026-11-10')).toEqual(ATTEND[6]);
    expect(a.step).toBe(0);
  });

  it('일당은 2개 · 4개 받으면 단계로 준다', () => {
    const w = { key: '', got: 0 };
    const d = { dateKey: '2026-11-10', items: [0, 1, 2, 3].map((i) => ({ id: `m${i}`, count: 1, claimed: i < 1 })) };
    expect(wageReady(w, d)).toBe(-1);
    d.items[1].claimed = true;
    expect(claimWage(w, d)).toEqual({ dust: 40 });
    expect(wageReady(w, d)).toBe(-1);
    d.items[2].claimed = d.items[3].claimed = true;
    expect(claimWage(w, d)).toEqual(wageReward(1, '2026-11-10'));
    expect(claimWage(w, d)).toBeNull();
    // 다음 날은 다시 0단계부터
    expect(wageReady(w, { dateKey: '2026-11-11', items: d.items })).toBe(0);
  });

  it('월급은 칸이 있는 동안 하루 한 번', () => {
    const s = { left: 2, key: '' };
    expect(claimSalary(s, '2026-11-01')).not.toBeNull();
    expect(salaryReady(s, '2026-11-01')).toBe(false);
    expect(claimSalary(s, '2026-11-05')).not.toBeNull();
    expect(claimSalary(s, '2026-11-06')).toBeNull();
    expect(s.left).toBe(0);
  });

  it('시계가 앞섰다 돌아와도 낸 돈의 월급이 잠기지 않는다', () => {
    const s = { left: 5, key: '2026-12-25' }; // 앞선 시계에서 받은 흔적
    expect(salaryReady(s, '2026-11-01')).toBe(false); // 오늘 몫은 받은 것으로 친다
    expect(s.key).toBe('2026-11-01');
    expect(claimSalary(s, '2026-11-02')).not.toBeNull(); // 다음 날부터 다시 받는다
    expect(s.left).toBe(4);
  });

  it('광고 궤도조각 하루 상한', () => {
    const day = { key: '', n: 0 };
    expect(adOrbitLeft(day, 'a')).toBe(AD_ORBIT_DAILY);
    noteAdOrbit(day, 'a');
    noteAdOrbit(day, 'a');
    expect(adOrbitLeft(day, 'a')).toBe(AD_ORBIT_DAILY - 2);
    expect(adOrbitLeft(day, 'b')).toBe(AD_ORBIT_DAILY);
    noteAdOrbit(day, 'b');
    expect(day).toEqual({ key: 'b', n: 1 });
  });
});

function facts(over: Partial<Facts> = {}): Facts {
  return { buildings: 0, runs: 0, specials: 0, guards: 0, bosses: 0, kitRuns: 0, stageClears: 0, weapons: 1, book: 9, license: 0, chapters: 0, ...over };
}

describe('신입 과제', () => {
  it('일곱 단계이고 첫 칸 보상으로 망치를 산다', () => {
    expect(ROOKIE.length).toBe(7);
    expect(ROOKIE[0].reward.dust).toBeGreaterThanOrEqual(300);
    expect(rookieReady(0, facts())).toBe(false);
    expect(rookieReady(0, facts({ runs: 1 }))).toBe(true);
    expect(rookieReady(7, facts())).toBe(false);
  });

  it('출근부 일곱째 칸은 마스크 한 개를 준다', () => {
    const inv = { dust: 0, orbit: 0, items: emptyItems(), owned: [], blanks: 0 };
    giveReward(inv, ATTEND[6]);
    expect(inv.blanks).toBe(1);
    expect(rewardText(ATTEND[6])).toContain('마스크 1개');
  });

  it('마지막 칸이 전용 꾸미기를 준다', () => {
    expect(ROOKIE[6].reward.owns).toContain('sprout');
    const inv = { dust: 0, orbit: 0, items: emptyItems(), owned: ['sprout'], blanks: 0 };
    giveReward(inv, ROOKIE[6].reward);
    expect(inv.owned).toEqual(['sprout']);
    expect(rewardText(ROOKIE[0].reward)).toBe('먼지 300 · 예비 목숨 3 · 필살 충전 3 · 먼지 자루 2');
  });
});

describe('실적', () => {
  it('마흔 개를 넘고 id가 안 겹치며 기존 id가 남아 있다', () => {
    expect(ACHIEVES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACHIEVES.map((d) => d.id)).size).toBe(ACHIEVES.length);
    for (const id of ['first_act2', 'moon_clear', 'combo_100', 'combo_500', 'combo_999', 'butter_perfect', 'pin_escape', 'revive_3']) {
      expect(ACHIEVES.some((d) => d.id === id)).toBe(true);
    }
  });

  it('이벤트로 세는 실적은 트랙이 있다', () => {
    for (const d of ACHIEVES) if (!d.stat) expect(TRACK_BY_ID[d.id]).toBeTruthy();
  });

  it('저장 값으로 맞추고 이번에 처음 채운 것을 돌려준다', () => {
    const list = initAchieveProgress();
    expect(syncAchieves(list, facts({ buildings: 99 }))).toEqual([]);
    expect(list.find((p) => p.id === 'ach_b100')?.count).toBe(99);
    expect(syncAchieves(list, facts({ buildings: 100 })).map((d) => d.id)).toEqual(['ach_b100']);
    expect(syncAchieves(list, facts({ buildings: 100 }))).toEqual([]);
  });

  it('부문마다 지금 단계 하나만 보인다', () => {
    const list = initAchieveProgress();
    list.find((p) => p.id === 'ach_b100')!.claimed = true;
    const row = achieveLines(list).find((l) => l.line === '철거')!;
    expect(row.def?.id).toBe('ach_b500');
    expect([row.done, row.total]).toEqual([1, 5]);
  });

  it('칭호는 받은 실적에서 나온다', () => {
    const list = initAchieveProgress();
    expect(titlesOf(list, 0)).toEqual([]);
    list.find((p) => p.id === 'ach_b500')!.claimed = true;
    expect(titlesOf(list, ROOKIE.length)).toEqual([ROOKIE_TITLE, '철거 반장']);
  });

  it('옛 저장의 실적은 받은 기록을 살리고 새 실적을 채운다', () => {
    const merged = mergeAchieves([{ id: 'combo_100', count: 100, claimed: true }, { id: 'gone', count: 1, claimed: false }]);
    expect(merged.length).toBe(ACHIEVES.length);
    expect(merged.find((p) => p.id === 'combo_100')?.claimed).toBe(true);
    expect(merged.some((p) => p.id === 'gone')).toBe(false);
  });
});

describe('평생 값', () => {
  it('저장에서 지시서 · 무기 · 도감 수를 읽는다', () => {
    const f = factsOf({
      stats: { buildings: 1, runs: 2, specials: 3, guards: 4, bosses: 5, kitRuns: 6 },
      stages: { '1-1': { lamp: 1 }, '1-2': { lamp: 0 } },
      owned: ['hammer', 'amber'],
      license: 1,
      unlockedChapters: 2,
    }, 12);
    expect(f.stageClears).toBe(1);
    expect(f.weapons).toBe(2);
    expect(f.book).toBe(12);
    expect(f.chapters).toBe(2);
  });
});

describe('저장', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    };
  });

  it('옛 저장은 새 칸이 기본값으로 채워지고 잃는 것이 없다', () => {
    mem.set(SAVE_KEY, JSON.stringify({ v: 1, dust: 500, orbit: 50, stats: { buildings: 7, runs: 3 }, achieves: [{ id: 'combo_100', count: 100, claimed: true }] }));
    const s = loadSave();
    expect(s.dust).toBe(500);
    expect(s.stats).toEqual({ buildings: 7, runs: 3, specials: 0, guards: 0, bosses: 0, kitRuns: 0 });
    expect(s.items).toEqual(emptyItems());
    expect(s.achieves.find((p) => p.id === 'combo_100')?.claimed).toBe(true);
    expect(s.achieves.length).toBe(ACHIEVES.length);
  });

  it('새 칸이 왕복한다', () => {
    const d = structuredClone(DEFAULT_SAVE);
    addItems(d.items, { life: 2 });
    d.owned = [...d.owned, 'coverall'];
    d.loadout = { ...d.loadout, body: 'coverall' };
    d.bought = ['rookie_sale', 'unknown'];
    d.noAds = true;
    d.salary = { left: 12, key: '2026-11-01' };
    d.attend = { step: 3, key: '2026-11-01' };
    d.wage = { key: '2026-11-01', got: 1 };
    d.rookie = 2;
    d.offers.rookieUntil = 123;
    d.adDay = { key: 'k', n: 2 };
    d.iapTokens = ['t'];
    d.bestBare = 42;
    saveSave(d);
    const s = loadSave();
    expect(s.items.life).toBe(2);
    expect(s.loadout.body).toBe('coverall');
    expect(s.bought).toEqual(['rookie_sale']);
    expect(s.noAds).toBe(true);
    expect(s.salary.left).toBe(12);
    expect(s.attend.step).toBe(3);
    expect(s.wage.got).toBe(1);
    expect(s.rookie).toBe(2);
    expect(s.offers.rookieUntil).toBe(123);
    expect(s.adDay.n).toBe(2);
    expect(s.iapTokens).toEqual(['t']);
    expect(s.bestBare).toBe(42);
  });

  it('깨진 값은 잘라서 살린다', () => {
    mem.set(SAVE_KEY, JSON.stringify({ v: 1, items: { life: 1e9, waza: 'x', dust2x: -3 }, rookie: 99, attend: { step: 99 } }));
    const s = loadSave();
    expect(s.items).toEqual(validateItems({ life: 999 }));
    expect(s.rookie).toBe(ROOKIE.length);
    expect(s.attend.step).toBe(ATTEND.length - 1);
  });

  it('kstDateKey 형식이 그대로라 문자열 비교가 날짜 순서다', () => {
    expect(kstDateKey(T0) < kstDateKey(T0 + 24 * HOUR)).toBe(true);
  });
});
