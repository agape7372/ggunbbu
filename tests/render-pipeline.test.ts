import { describe, expect, it } from 'vitest';
import { BOSS, PLAYER, VIEW } from '../src/config';
import manifest from '../src/assets/manifest.json';
import { backdropKey } from '../src/render/background';
import { PLAYER_SHEET, playerSheetFrame } from '../src/render/frames';
import { executorPose } from '../src/render/executor';
import { initBoss } from '../src/core/boss';
import { drawAsset, hasAsset } from '../src/render/assets';
import { floorImageKey } from '../src/render/floorSheets';

describe('render pipeline', () => {
  it('floor decoration keeps special materials and single-floor grades visible', () => {
    expect(floorImageKey('hard', 'europe', 0, 1)).toBe('europe:hard');
    expect(floorImageKey('weak', 'asia', 0, 4)).toBe('asia:entrance');
    expect(floorImageKey('hard', 'eastasia', 3, 4)).toBe('eastasia:roof');
    expect(floorImageKey('hard', 'modern', 1, 4)).toBe('modern:hard');
    expect(floorImageKey('butter', 'modern', 0, 10)).toBe('butter');
    expect(floorImageKey('cathedral', 'europe', 0, 3, 'glass')).toBe('cathedral');
  });

  it('glass and ice zones select their sheet rows, including the outer floors', () => {
    expect(floorImageKey('weak', 'modern', 0, 3, 'glass')).toBe('glass');
    expect(floorImageKey('hard', 'eastasia', 2, 3, 'ice')).toBe('ice');
    expect(floorImageKey('mid', 'modern', 1, 3, 'none')).toBe('modern:mid');
  });

  it('manifest lists all four chapter backgrounds', () => {
    const images = manifest.images as Record<string, { src: string; frames?: number }>;
    for (const theme of ['europe', 'asia', 'eastasia', 'modern']) {
      expect(images[`bg-${theme}`]?.src).toBe(`bg/${theme}.png`);
    }
    expect(images.player.frames).toBe(PLAYER_SHEET.length);
    expect(images.boss.frames).toBeUndefined();
    expect(manifest.images.boss.w).toBe(VIEW.LANE_W);
  });

  it('backdropKey follows mode and chapter', () => {
    expect(backdropKey({ mode: 'act1', chapter: 0, act2Phase: null })).toBe('bg-europe');
    expect(backdropKey({ mode: 'act1', chapter: 1, act2Phase: null })).toBe('bg-asia');
    expect(backdropKey({ mode: 'act1', chapter: 2, act2Phase: null })).toBe('bg-eastasia');
    expect(backdropKey({ mode: 'tokoton', chapter: 3, act2Phase: null })).toBe('bg-modern');
    expect(backdropKey({ mode: 'act2', chapter: 0, act2Phase: 'cathedral' })).toBe('bg-act2');
    expect(backdropKey({ mode: 'act2', chapter: 0, act2Phase: 'moon' })).toBe('bg-executor');
    expect(backdropKey({ mode: 'bonus', chapter: 0, act2Phase: null })).toBe('bg-bonus');
  });

  it('playerSheetFrame matches attack windows', () => {
    expect(playerSheetFrame('idle', 0)).toBe(0);
    expect(playerSheetFrame('jump', 0)).toBe(1);
    expect(playerSheetFrame('attack', 0)).toBe(2);
    expect(playerSheetFrame('attack', PLAYER.ATTACK_PRE)).toBe(3);
    expect(playerSheetFrame('attack', PLAYER.ATTACK_PRE + PLAYER.ATTACK_ACTIVE)).toBe(4);
    expect(playerSheetFrame('guardG', 0)).toBe(5);
    expect(playerSheetFrame('guardA', 0)).toBe(6);
    expect(playerSheetFrame('pinned', 0)).toBe(9);
    expect(playerSheetFrame('dead', 0)).toBe(10);
  });

  it('executor closes at the damage tick and recoils during guard recovery', () => {
    const boss = initBoss(); boss.st = 'charging'; boss.pattern = 'charge';
    expect(executorPose(boss).open).toBeGreaterThan(0);
    boss.stTick = Math.floor(BOSS.CHARGE.DASH / 2);
    expect(executorPose(boss).open).toBe(0);
    expect(executorPose(boss).lift).toBeCloseTo(0);
    boss.st = 'stagger'; boss.stTick = 12;
    expect(executorPose(boss).lift).toBeLessThan(0);
    expect(executorPose(boss).open).toBeGreaterThan(0);
  });

  it('missing PNG assets fall back instead of throwing', () => {
    // ★08-30: 'player' 부재 단언 제거 — 실PNG를 넣는 순간(Wave 3) 테스트가 깨지던 함정.
    // 폴백 계약은 "미등록/미로드 키는 false"이며 특정 키의 부재는 계약이 아니다.
    expect(hasAsset('no-such-key')).toBe(false);
    const ctx = { drawImage() { throw new Error('should not draw'); } } as unknown as CanvasRenderingContext2D;
    expect(drawAsset(ctx, 'no-such-key', 0, 0)).toBe(false);
    expect(drawAsset(ctx, 'bg-missing', 0, 0)).toBe(false);
  });
});
