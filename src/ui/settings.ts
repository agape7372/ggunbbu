// 설정 적용 레이어. DOM 시트는 overlay.ts 취급설명서가 담당 — 여기선 중복 그리지 않는다.
// leftHanded → touch.setLeftHanded, shake/vibration → renderer.setFeedbackOptions, sound → audio.

import type { ButtonLayout } from '../input/layout';
import { saveSave, type SaveData, type SaveSettings } from '../storage';

export const SHAKE_LABEL = ['없음', '약하게', '기본'] as const;
export const FLASH_LABEL = SHAKE_LABEL;

export interface SettingsSinks {
  setSoundOn(on: boolean): void;
  setBgmOn(on: boolean): void;
  setSfxOn(on: boolean): void;
  setFeedbackOptions(o: { shakeLevel: 0 | 1 | 2; vibration: boolean; flashLevel: 0 | 1 | 2 }): void;
  setLeftHanded(on: boolean): void;
  /** 조작 키 배치. null = 기본 배치 */
  setButtonLayout(layout: ButtonLayout | null): void;
}

/** storage 패치를 싱크에 반영하고 저장한다. 반환값은 병합된 settings. */
export function applySettingsPatch(
  save: SaveData,
  patch: Partial<SaveSettings>,
  sinks: SettingsSinks,
): SaveSettings {
  Object.assign(save.settings, patch);
  if (patch.sound !== undefined) sinks.setSoundOn(patch.sound);
  if (patch.bgm !== undefined) sinks.setBgmOn(patch.bgm);
  if (patch.sfx !== undefined) sinks.setSfxOn(patch.sfx);
  if (patch.vibration !== undefined || patch.shakeLevel !== undefined || patch.flashLevel !== undefined) {
    sinks.setFeedbackOptions(feedbackOf(save.settings));
  }
  if (patch.leftHanded !== undefined) sinks.setLeftHanded(patch.leftHanded);
  // 배치를 기본으로 되돌릴 땐 {buttonLayout: undefined} — 값이 없어도 키가 있으면 적용한다
  if ('buttonLayout' in patch) sinks.setButtonLayout(save.settings.buttonLayout ?? null);
  saveSave(save);
  return save.settings;
}

function feedbackOf(s: SaveSettings): { shakeLevel: 0 | 1 | 2; vibration: boolean; flashLevel: 0 | 1 | 2 } {
  return { shakeLevel: s.shakeLevel, vibration: s.vibration, flashLevel: s.flashLevel };
}

/** 부팅 시 저장값을 터치/셰이크/소리에 한 번 밀어넣는다. */
export function applySettingsToRuntime(save: SaveData, sinks: SettingsSinks): void {
  sinks.setSoundOn(save.settings.sound);
  sinks.setBgmOn(save.settings.bgm);
  sinks.setSfxOn(save.settings.sfx);
  sinks.setFeedbackOptions(feedbackOf(save.settings));
  sinks.setLeftHanded(save.settings.leftHanded);
  sinks.setButtonLayout(save.settings.buttonLayout ?? null);
}
