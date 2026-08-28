import { describe, expect, it } from 'vitest';
import { PLAYER } from '../src/config';
import manifest from '../src/assets/manifest.json';
import { backdropKey } from '../src/render/background';
import { BOSS_SHEET, PLAYER_SHEET, bossSheetFrame, playerSheetFrame } from '../src/render/frames';
import { drawAsset, hasAsset } from '../src/render/assets';

describe('render pipeline', () => {
  it('manifest lists all four chapter backgrounds', () => {
    const images = manifest.images as Record<string, { src: string; frames?: number }>;
    for (const theme of ['europe', 'asia', 'eastasia', 'modern']) {
      expect(images[`bg-${theme}`]?.src).toBe(`bg/${theme}.png`);
    }
    expect(images.player.frames).toBe(PLAYER_SHEET.length);
    expect(images.boss.frames).toBe(BOSS_SHEET.length);
  });

  it('backdropKey follows mode and chapter', () => {
    expect(backdropKey({ mode: 'act1', chapter: 0, act2Phase: null })).toBe('bg-europe');
    expect(backdropKey({ mode: 'act1', chapter: 1, act2Phase: null })).toBe('bg-asia');
    expect(backdropKey({ mode: 'act1', chapter: 2, act2Phase: null })).toBe('bg-eastasia');
    expect(backdropKey({ mode: 'tokoton', chapter: 3, act2Phase: null })).toBe('bg-modern');
    expect(backdropKey({ mode: 'act2', chapter: 0, act2Phase: 'cathedral' })).toBe('bg-act2');
    expect(backdropKey({ mode: 'act2', chapter: 0, act2Phase: 'moon' })).toBe('bg-moon');
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

  it('bossSheetFrame maps combat states', () => {
    expect(bossSheetFrame('idle')).toBe(0);
    expect(bossSheetFrame('charging')).toBe(1);
    expect(bossSheetFrame('descend')).toBe(1);
    expect(bossSheetFrame('stagger')).toBe(2);
    expect(bossSheetFrame('defeated')).toBe(3);
  });

  it('missing PNG assets fall back instead of throwing', () => {
    expect(hasAsset('player')).toBe(false);
    expect(hasAsset('no-such-key')).toBe(false);
    const ctx = { drawImage() { throw new Error('should not draw'); } } as unknown as CanvasRenderingContext2D;
    expect(drawAsset(ctx, 'player', 0, 0)).toBe(false);
    expect(drawAsset(ctx, 'bg-missing', 0, 0)).toBe(false);
  });
});
