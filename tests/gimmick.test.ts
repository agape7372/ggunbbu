// 구역작전 기믹 4종(glass · ice · night · orbit) — core 분기 한 건씩 + 시각 시그니처(렌더 읽기 전용).
// core 동작은 바꾸지 않는 묶음이다: 수치는 config(GIMMICK · STACK)에서 읽어 와 "기믹이 켜졌을 때만" 달라짐을 본다.
import { beforeEach, describe, expect, it } from 'vitest';
import { ACT1, GIMMICK, JUICE_SYS, PALETTE, PLAYER, STACK } from '../src/config';
import { makeFloor, makeStack } from '../src/core/building';
import { destroyStack, tryGuardBounce } from '../src/core/combat';
import { advance, makeState } from '../src/core/sim';
import { spawnAct1Building } from '../src/core/spawner';
import { EMPTY_INPUT, type GameState, type GimmickId } from '../src/core/types';
import { drawEffects, resetEffects, spawnFromEvent } from '../src/render/effects';
import { fillSmallPaperPockets } from '../src/render/skylineWindows';

function arcade(gimmick: GimmickId, seed = 7): GameState {
  const s = makeState({ seed });
  s.gimmick = gimmick;
  return s;
}

/** 지면 가드 존 안에서 내려오는 건물 한 채 */
function fallingStack(s: GameState, y: number): void {
  s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('mid'), makeFloor('mid')], y, vy: -100 });
}

describe('glass — 짝수 층이 HP1 약한 층으로 덮인다', () => {
  it('0·2·4… 층은 weak · HP1, 기믹이 없으면 그렇게 몰리지 않는다', () => {
    let glassEverywhere = true;
    for (let seed = 1; seed <= 12; seed++) {
      const s = arcade('glass', seed);
      s.p = 0.8;                                  // 강한 층이 많이 나오는 구간
      spawnAct1Building(s);
      s.stack!.floors.forEach((f, i) => {
        if (i % GIMMICK.GLASS_EVERY !== 0) return;
        expect(f.mat).toBe('weak');
        expect(f.segs[0]).toEqual({ hp: 1, maxHp: 1 });
      });
      const plain = arcade('none', seed);
      plain.p = 0.8;
      spawnAct1Building(plain);
      if (!plain.stack!.floors.every((f, i) => i % GIMMICK.GLASS_EVERY !== 0 || f.segs[0].maxHp === 1)) glassEverywhere = false;
    }
    expect(glassEverywhere).toBe(false);
  });
});

describe('ice — 가드 반동이 줄어든다', () => {
  it('지면 가드: GUARD_GROUND_V × ICE_BOUNCE_GROUND, 기믹이 없으면 ×1', () => {
    const ice = arcade('ice');
    fallingStack(ice, STACK.GUARD_ZONE_GROUND - 10);
    expect(tryGuardBounce(ice, 'ground', 0)).toBe(true);
    expect(ice.stack!.vy).toBeCloseTo(STACK.GUARD_GROUND_V * GIMMICK.ICE_BOUNCE_GROUND);

    const none = arcade('none');
    fallingStack(none, STACK.GUARD_ZONE_GROUND - 10);
    tryGuardBounce(none, 'ground', 0);
    expect(none.stack!.vy).toBe(STACK.GUARD_GROUND_V);
  });

  it('공중 가드: GUARD_AIR_V × ICE_BOUNCE_AIR, 기믹이 없으면 ×1', () => {
    const plane = 100 + PLAYER.H;
    const ice = arcade('ice');
    fallingStack(ice, plane);
    expect(tryGuardBounce(ice, 'air', 100)).toBe(true);
    expect(ice.stack!.vy).toBeCloseTo(STACK.GUARD_AIR_V * GIMMICK.ICE_BOUNCE_AIR);

    const none = arcade('none');
    fallingStack(none, plane);
    tryGuardBounce(none, 'air', 100);
    expect(none.stack!.vy).toBe(STACK.GUARD_AIR_V);
  });
});

describe('night — 완파 뒤 다음 건물이 빨리 온다', () => {
  it('재스폰 간격 = RESPAWN_TICKS × NIGHT_RESPAWN_MUL(하한 12), 기믹이 없으면 그대로', () => {
    const night = arcade('night');
    fallingStack(night, 300);
    destroyStack(night);
    expect(night.stackSpawnCd).toBe(Math.max(12, Math.floor(STACK.RESPAWN_TICKS * GIMMICK.NIGHT_RESPAWN_MUL)));
    expect(night.stackSpawnCd).toBeLessThan(STACK.RESPAWN_TICKS);

    const none = arcade('none');
    fallingStack(none, 300);
    destroyStack(none);
    expect(none.stackSpawnCd).toBe(STACK.RESPAWN_TICKS);
  });
});

describe('orbit — 건물이 더 빠르게 떨어지기 시작한다', () => {
  it('스폰 초속 = ORBIT_SPAWN_VY, 기본은 DEFAULT_SPAWN_VY', () => {
    const orbit = arcade('orbit');
    spawnAct1Building(orbit);
    expect(orbit.stack!.vy).toBe(GIMMICK.ORBIT_SPAWN_VY);

    const none = arcade('none');
    spawnAct1Building(none);
    expect(none.stack!.vy).toBe(GIMMICK.DEFAULT_SPAWN_VY);
    expect(orbit.stack!.vy).toBeLessThan(none.stack!.vy);
  });
});

// ── 시각 시그니처 ──────────────────────────────────────────────

/** 파티클을 그리는 동안 색·칠 호출을 모으는 기록용 ctx */
function paint(): { ctx: CanvasRenderingContext2D; styles: Set<string>; outlined: () => number } {
  const styles = new Set<string>();
  let rects = 0;
  const target: Record<string, unknown> = { strokeRect: () => { rects += 1; } };
  const ctx = new Proxy(target, {
    get: (t, k: string) => t[k] ?? (() => undefined),
    set: (t, k: string, v) => { if ((k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string') styles.add(v); t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, styles, outlined: () => rects };
}

describe('구역 시그니처 — 파티클', () => {
  beforeEach(() => resetEffects());

  it('glass: 층이 무너지면 잉크 외곽선 유리 조각이 더 나온다(기믹이 없으면 없다)', () => {
    const count = (g: GimmickId): number => {
      resetEffects();
      const s = arcade(g);
      spawnFromEvent(s, { kind: 'floorCollapse', lane: 0, y: 200, mat: 'weak', combo: 3 });
      const p = paint();
      drawEffects(p.ctx, 0);
      return p.outlined();
    };
    expect(count('none')).toBe(0);
    expect(count('glass')).toBeGreaterThanOrEqual(JUICE_SYS.GLASS_CHIPS - Math.ceil(JUICE_SYS.GLASS_CHIPS / 3));
  });

  it('ice: 지면 가드 스파크에 파랑이 실린다(기믹이 없으면 없다) — 새 색 없이 PALETTE만', () => {
    const colors = (g: GimmickId): Set<string> => {
      resetEffects();
      const s = arcade(g);
      spawnFromEvent(s, { kind: 'guardBounce', y: 30 });
      const p = paint();
      drawEffects(p.ctx, 0);
      return p.styles;
    };
    expect(colors('none').has(PALETTE.BLUE)).toBe(false);
    expect(colors('ice').has(PALETTE.BLUE)).toBe(true);
    // 공중 가드엔 얹지 않는다 — 지면 가드 전용
    resetEffects();
    spawnFromEvent(arcade('ice'), { kind: 'guardAirBounce', y: 120 });
    const air = paint();
    drawEffects(air.ctx, 0);
    expect(air.styles.has(PALETTE.BLUE)).toBe(false);
  });
});

describe('night — 스카이라인 창 채우기(순수 픽셀 처리)', () => {
  /** w×h 종이색 바탕에 잉크 선으로 큰 건물 1채(안에 창 2개)를 그린 RGBA */
  function skyline(): { px: Uint8ClampedArray; w: number; h: number } {
    const w = 60, h = 60;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { px[i * 4] = 244; px[i * 4 + 1] = 241; px[i * 4 + 2] = 232; px[i * 4 + 3] = 255; }
    const ink = (x: number, y: number): void => { const o = (y * w + x) * 4; px[o] = 26; px[o + 1] = 26; px[o + 2] = 32; };
    const box = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let x = x0; x <= x1; x++) { ink(x, y0); ink(x, y1); }
      for (let y = y0; y <= y1; y++) { ink(x0, y); ink(x1, y); }
    };
    box(10, 10, 49, 58);      // 건물 몸통 — 안쪽 면적 38×47
    box(16, 18, 21, 25);      // 창 (안쪽 4×6 = 24)
    box(30, 18, 35, 25);      // 창
    return { px, w, h };
  }
  const lumaAt = (px: Uint8ClampedArray, w: number, x: number, y: number): number => px[(y * w + x) * 4];

  it('작게 닫힌 칸(창)만 잉크로 채우고 하늘·건물 몸통은 그대로 둔다', () => {
    const { px, w, h } = skyline();
    const n = fillSmallPaperPockets(px, w, h, 200, [26, 26, 32]);
    expect(n).toBe(2);
    expect(lumaAt(px, w, 18, 21)).toBe(26);     // 창 안
    expect(lumaAt(px, w, 32, 21)).toBe(26);
    expect(lumaAt(px, w, 25, 40)).toBe(244);    // 건물 몸통(큰 칸)
    expect(lumaAt(px, w, 3, 3)).toBe(244);      // 하늘
  });

  it('화면 가장자리에 닿은 작은 칸은 건드리지 않는다', () => {
    const w = 10, h = 10;
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < h; y++) { const o = (y * w + 4) * 4; px[o] = px[o + 1] = px[o + 2] = 26; } // 세로선 → 왼쪽 4열 조각
    expect(fillSmallPaperPockets(px, w, h, 200, [26, 26, 32])).toBe(0);
  });
});

describe('특별작전은 구역 경계를 넘어도 그 구역에 머문다', () => {
  it('기믹 판은 경계·2막 문턱을 넘는 점수에도 act1에 남고, 기본 판은 넘어간다', () => {
    for (const g of ['glass', 'orbit', 'none'] as const) {
      const s = arcade(g);
      s.score = ACT1.UNLOCK_SCORE; // 경계 셋과 2막 문턱을 한꺼번에 넘긴 점수
      advance(s, EMPTY_INPUT);
      if (g === 'none') {
        expect(s.mode).not.toBe('act1');
      } else {
        expect(s.mode).toBe('act1');
        expect(s.chapter).toBe(0);
        expect(s.events.some((e) => e.kind === 'chapterUnlock')).toBe(false);
      }
    }
  });
});
