// 달 보스(위성 "보름호") FSM.
// [정본] HP 230 (= 원문 50+100+80), 티어 임계 누적대미지 50/150, 230+타 격파.
// 패턴: 돌진/영거리(B)/강화돌진(C)/번개5/번개9(C)/드론5/대포3(C).

import type { BossPattern, BossState, GameState, Lane } from './types';
import { registerHit, hurtPlayer, addScore } from './combat';
import { guardActive } from './player';
import { rand, randInt } from './rng';
import { spawnBolt } from './act2';
import { BOSS, SCORE, TICK, VIEW } from '../config';

export function initBoss(): BossState {
  return {
    hp: BOSS.HP, dmg: 0, tier: 0,
    st: 'enter', stTick: 0,
    pattern: null, lastPattern: null, step: 0,
    y: VIEW.H + 80, targetLane: 1, hittable: false,
  };
}

function tierPool(tier: 0 | 1 | 2): BossPattern[] {
  if (tier === 0) return ['charge', 'riseBolt5', 'rabbits'];
  if (tier === 1) return ['charge', 'riseBolt5', 'rabbits'];
  return ['multiCharge', 'riseBolt9', 'rabbits', 'cannons'];
}

export function stepBoss(s: GameState): void {
  const b = s.boss;
  if (!b) return;
  b.stTick += 1;
  const p = s.player;

  // 티어 전이 체크 (roar/defeated 중엔 무시)
  const newTier: 0 | 1 | 2 = b.dmg >= BOSS.TIER2_DMG ? 2 : b.dmg >= BOSS.TIER1_DMG ? 1 : 0;
  if (newTier > b.tier && b.st !== 'roar' && b.st !== 'defeated') {
    b.tier = newTier;
    setSt(b, 'roar');
    b.hittable = false;
    b.y = BOSS.HOVER_HIGH;
    s.events.push({ kind: 'phaseClear', n: 100 + newTier }); // 렌더: 포효 연출
    return;
  }

  switch (b.st) {
    case 'enter': {
      b.y = Math.max(BOSS.HOVER_HIGH, b.y - 200 * TICK);
      if (b.stTick >= 90) { setSt(b, 'idle'); b.y = BOSS.HOVER_LOW; b.hittable = true; }
      break;
    }
    case 'idle': { // 회복 틈 — 저공 호버, 딜 창
      b.y = BOSS.HOVER_LOW;
      b.hittable = true;
      if (b.stTick >= BOSS.RECOVER_TICKS) selectPattern(s, b);
      break;
    }
    case 'roar': {
      if (b.stTick >= BOSS.ROAR_TICKS) { setSt(b, 'idle'); b.hittable = true; }
      break;
    }
    case 'telegraph': {
      b.hittable = false;
      const dur = b.pattern === 'pbCharge' ? BOSS.PB_CHARGE.TELE
        : b.pattern === 'cannons' ? BOSS.CANNON.AIM_TELE
        : BOSS.CHARGE.TELE;
      if (b.stTick >= dur) {
        if (b.pattern === 'charge' || b.pattern === 'multiCharge') setSt(b, 'descend');
        else if (b.pattern === 'pbCharge') setSt(b, 'charging');
        else if (b.pattern === 'riseBolt5' || b.pattern === 'riseBolt9') setSt(b, 'rising');
        else setSt(b, 'attacking'); // rabbits/cannons
      }
      break;
    }
    case 'descend': {
      b.y = Math.max(64, BOSS.HOVER_HIGH - (BOSS.HOVER_HIGH - 64) * (b.stTick / BOSS.CHARGE.DESCEND));
      b.hittable = b.stTick >= BOSS.CHARGE.DESCEND / 2; // 하강 후반 피격 가능
      if (b.stTick >= BOSS.CHARGE.DESCEND) setSt(b, 'charging');
      break;
    }
    case 'charging': {
      b.y = 64;
      b.hittable = true;
      const dashDur = b.pattern === 'pbCharge' ? BOSS.PB_CHARGE.DASH : BOSS.CHARGE.DASH;
      // 접촉 판정: 저공 돌진 — 플레이어가 지상 부근이면 피격, 가드로 저지
      if (b.stTick === Math.floor(dashDur / 2)) {
        const ga = guardActive(p);
        const blocked = b.pattern === 'pbCharge'
          ? ga === 'ground'                       // [정본] 영거리: 지면가드/필살 무적만
          : ga !== null;                          // [정본] 돌진: 가드로 저지
        if (blocked) {
          if (b.pattern === 'multiCharge' && b.step < BOSS.MULTI_CHARGE.COUNT - 1) {
            b.step += 1;                          // [정본] 1·2회 저지해도 반복 돌진
            setSt(b, 'telegraph');
            b.stTick = BOSS.CHARGE.TELE - BOSS.MULTI_CHARGE.REAIM; // 재조준 단축
          } else {
            setSt(b, 'stagger');
            s.events.push({ kind: 'guardBounce', y: 64 });
          }
        } else if (p.y < 80 && p.invulnTicks <= 0 && p.pose !== 'special') {
          hurtPlayer(s);
          if (b.pattern === 'multiCharge' && b.step < BOSS.MULTI_CHARGE.COUNT - 1) {
            b.step += 1;
            setSt(b, 'telegraph');
            b.stTick = BOSS.CHARGE.TELE - BOSS.MULTI_CHARGE.REAIM;
          } else {
            setSt(b, 'rising');
          }
        }
      }
      if (b.st === 'charging' && b.stTick >= dashDur) {
        // 통과 완료 (플레이어 무적/점프로 회피됨)
        if (b.pattern === 'multiCharge' && b.step < BOSS.MULTI_CHARGE.COUNT - 1) {
          b.step += 1;
          setSt(b, 'telegraph');
          b.stTick = BOSS.CHARGE.TELE - BOSS.MULTI_CHARGE.REAIM;
        } else if (b.pattern === 'charge' && b.tier >= 1 && rand(s) < BOSS.PB_CHARGE.CHAIN_CHANCE) {
          // [정본] B티어: 돌진 후 영거리 연계
          b.pattern = 'pbCharge';
          b.targetLane = p.lane;
          setSt(b, 'telegraph');
          s.events.push({ kind: 'boltCue', lane: p.lane }); // 전용 고음 예고 (렌더: bossPbTele)
        } else {
          setSt(b, 'rising');
        }
      }
      break;
    }
    case 'stagger': {
      const dur = b.pattern === 'pbCharge' ? BOSS.PB_CHARGE.STAGGER
        : b.pattern === 'multiCharge' ? BOSS.MULTI_CHARGE.STAGGER
        : b.pattern === 'riseBolt5' || b.pattern === 'riseBolt9' ? BOSS.RISE.DOWN_WINDOW
        : BOSS.CHARGE.STAGGER;
      b.y = BOSS.HOVER_LOW;
      b.hittable = true;
      if (b.stTick >= dur) setSt(b, 'idle');
      break;
    }
    case 'rising': {
      b.y = Math.min(BOSS.HOVER_HIGH, b.y + 400 * TICK);
      b.hittable = false;
      if (b.stTick >= 40) {
        if (b.pattern === 'riseBolt5' || b.pattern === 'riseBolt9') { setSt(b, 'attacking'); b.step = 0; }
        else setSt(b, 'idle');
      }
      break;
    }
    case 'attacking': {
      stepAttackPattern(s, b);
      break;
    }
    case 'defeated': {
      b.y += 60 * TICK;
      if (b.stTick >= 180) s.over = 'cleared';
      break;
    }
  }
}

function setSt(b: BossState, st: BossState['st']): void {
  b.st = st;
  b.stTick = 0;
}

function selectPattern(s: GameState, b: BossState): void {
  const pool = tierPool(b.tier).filter((x) => x !== b.lastPattern);
  const pick = pool[randInt(s, pool.length)];
  b.pattern = pick;
  b.lastPattern = pick;
  b.step = 0;
  b.targetLane = s.player.lane;
  setSt(b, 'telegraph');
  s.events.push({ kind: 'boltCue', lane: s.player.lane }); // 렌더: bossTele
}

function stepAttackPattern(s: GameState, b: BossState): void {
  const pat = b.pattern;
  if (pat === 'riseBolt5') {
    b.hittable = false;
    if (b.step < 5 && b.stTick % BOSS.RISE.BOLT_GAP_5 === 1) {
      spawnBolt(s, randInt(s, 3) as Lane);
      b.step += 1;
    }
    if (b.step >= 5 && !s.entities.some((e) => e.kind === 'bolt')) setSt(b, 'stagger');
  } else if (pat === 'riseBolt9') {
    b.hittable = false;
    if (b.step < 3 && b.stTick % BOSS.RISE.WAVE_GAP_9 === 1) {
      // [정본] 3레인 동시 × 3웨이브
      spawnBolt(s, 0); spawnBolt(s, 1); spawnBolt(s, 2);
      b.step += 1;
    }
    if (b.step >= 3 && !s.entities.some((e) => e.kind === 'bolt')) setSt(b, 'stagger');
  } else if (pat === 'rabbits') {
    b.y = BOSS.HOVER_LOW;
    b.hittable = true; // 패턴 내내 주 딜 창
    if (b.step < BOSS.RABBIT.COUNT && b.stTick % BOSS.RABBIT.ENTER_GAP === 1) {
      const side = (b.step % 2 === 0 ? -1 : 1) as -1 | 1;
      s.entities.push({
        kind: 'rabbit',
        x: side === -1 ? -20 : VIEW.W + 20,
        y: 200, side, hp: BOSS.RABBIT.HP,
        fireTicks: BOSS.RABBIT.FIRE_DELAY,
        leaveTicks: -1,
      });
      b.step += 1;
    }
    stepRabbits(s);
    const anyLeft = s.entities.some((e) => e.kind === 'rabbit' || (e.kind === 'shot' && e.cancellable));
    if (b.step >= BOSS.RABBIT.COUNT && !anyLeft) setSt(b, 'idle');
  } else if (pat === 'cannons') {
    b.hittable = false;
    if (b.step < BOSS.CANNON.COUNT && b.stTick % BOSS.CANNON.AIM_GAP === 1) {
      const lane = randInt(s, 3) as Lane;
      s.entities.push({ kind: 'cannon', lane, hp: BOSS.CANNON.HP, fireTicks: BOSS.CANNON.AIM_TELE });
      s.events.push({ kind: 'boltCue', lane });
      b.step += 1;
    }
    stepCannons(s, b);
    const anyLeft = s.entities.some((e) => e.kind === 'cannon' || (e.kind === 'shot' && !e.guardable));
    if (b.step >= BOSS.CANNON.COUNT && !anyLeft) setSt(b, 'stagger');
  } else {
    setSt(b, 'idle');
  }
}

function stepRabbits(s: GameState): void {
  const remove: number[] = [];
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind !== 'rabbit') continue;
    // 진입 이동
    const targetX = e.side === -1 ? 50 : VIEW.W - 50;
    e.x += (targetX - e.x) * 0.1;
    if (e.leaveTicks < 0) {
      e.fireTicks -= 1;
      if (e.fireTicks <= 0) {
        // 사선 전기총 — 플레이어 현재 위치 조준 [정본]
        const px = VIEW.LANE_X[s.player.lane];
        const py = s.player.y + 24;
        const dx = px - e.x;
        const dy = py - e.y;
        const len = Math.hypot(dx, dy) || 1;
        s.entities.push({
          kind: 'shot', lane: s.player.lane,
          x: e.x, y: e.y,
          vx: (dx / len) * BOSS.RABBIT.SHOT_V,
          vy: (dy / len) * BOSS.RABBIT.SHOT_V,
          guardable: true, cancellable: true,   // [정본: 공격으로 상쇄 가능]
        });
        s.events.push({ kind: 'boltStrike', lane: s.player.lane });
        e.leaveTicks = BOSS.RABBIT.LEAVE;
      }
    } else {
      e.leaveTicks -= 1;
      e.x += e.side * -80 * TICK; // 퇴장
      if (e.leaveTicks <= 0) remove.push(i);
    }
  }
  for (let i = remove.length - 1; i >= 0; i--) s.entities.splice(remove[i], 1);
}

function stepCannons(s: GameState, b: BossState): void {
  void b;
  const remove: number[] = [];
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind !== 'cannon') continue;
    e.fireTicks -= 1;
    if (e.fireTicks === 0) {
      // 수직 전기탄 [정본: 가드 불가]
      s.entities.push({
        kind: 'shot', lane: e.lane,
        x: VIEW.LANE_X[e.lane], y: 260,
        vx: 0, vy: -BOSS.CANNON.SHOT_V,
        guardable: false, cancellable: false,
      });
    }
    if (e.fireTicks <= -30) remove.push(i); // 발사 후 잠시 뒤 퇴장
  }
  for (let i = remove.length - 1; i >= 0; i--) s.entities.splice(remove[i], 1);
}

/** 보스·드론·대포 타격 시도. [정본] 드론/대포 격파는 달 HP 미산입 */
export function tryHitBoss(s: GameState, lo: number, hi: number): boolean {
  const b = s.boss;
  if (!b) return false;
  const px = VIEW.LANE_X[s.player.lane];

  // 드론 (HP1, 격파 가능 [정본])
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind === 'rabbit' && Math.abs(e.x - px) < 50 && e.y >= lo && e.y <= hi) {
      s.entities.splice(i, 1);
      registerHit(s);
      s.events.push({ kind: 'bossHit', y: e.y });
      return true;
    }
    if (e.kind === 'cannon' && e.lane === s.player.lane && 260 >= lo && 260 <= hi) {
      e.hp -= 1;
      if (e.hp <= 0) s.entities.splice(i, 1);
      registerHit(s);
      s.events.push({ kind: 'bossHit', y: 260 });
      return true;
    }
  }

  // 본체
  if (b.hittable && b.y >= lo && b.y <= hi + BOSS.H) {
    b.hp -= 1;
    b.dmg += 1;
    registerHit(s);
    s.events.push({ kind: 'bossHit', y: b.y, n: b.hp });
    if (b.hp <= 0 && b.st !== 'defeated') {
      setSt(b, 'defeated');
      b.hittable = false;
      s.hitstop = 30; // 슬로우 연출 대체 (렌더는 bossDefeat로 확대 연출)
      addScore(s, SCORE.BOSS_BONUS);
      if (s.fullCombo) s.score = SCORE.CAP; // [정본] 2막 풀콤보 = 99,999,999 고정
      s.events.push({ kind: 'bossDefeat' });
    }
    return true;
  }
  return false;
}

/** 필살기가 보스에 닿을 때 (sim 호출) */
export function specialHitBoss(s: GameState): void {
  const b = s.boss;
  if (!b || b.st === 'defeated') return;
  b.hp -= 10;
  b.dmg += 10;
  s.events.push({ kind: 'bossHit', y: b.y, n: b.hp });
  if (b.hp <= 0) {
    setSt(b, 'defeated');
    b.hittable = false;
    addScore(s, SCORE.BOSS_BONUS);
    if (s.fullCombo) s.score = SCORE.CAP;
    s.events.push({ kind: 'bossDefeat' });
  }
}
