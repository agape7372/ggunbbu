// 설정 적용 레이어. DOM 시트는 overlay.ts 취급설명서가 담당 — 여기선 중복 그리지 않는다.
// leftHanded → touch.setLeftHanded, shake/vibration → renderer.setFeedbackOptions, sound → audio.

import { saveSave, type SaveData, type SaveSettings } from '../storage';

export const SHAKE_LABEL = ['흔들림 없음', '흔들림 약함', '흔들림 기본'] as const;

export interface SettingsSinks {
  setSoundOn(on: boolean): void;
  setFeedbackOptions(o: { shakeLevel: 0 | 1 | 2; vibration: boolean }): void;
  setLeftHanded(on: boolean): void;
}

/** storage 패치를 싱크에 반영하고 저장한다. 반환값은 병합된 settings. */
export function applySettingsPatch(
  save: SaveData,
  patch: Partial<SaveSettings>,
  sinks: SettingsSinks,
): SaveSettings {
  Object.assign(save.settings, patch);
  if (patch.sound !== undefined) sinks.setSoundOn(patch.sound);
  if (patch.vibration !== undefined || patch.shakeLevel !== undefined) {
    sinks.setFeedbackOptions({
      shakeLevel: save.settings.shakeLevel,
      vibration: save.settings.vibration,
    });
  }
  if (patch.leftHanded !== undefined) sinks.setLeftHanded(patch.leftHanded);
  saveSave(save);
  return save.settings;
}

export function cycleShakeLevel(level: 0 | 1 | 2): 0 | 1 | 2 {
  return ((level + 1) % 3) as 0 | 1 | 2;
}

/** 부팅 시 저장값을 터치/셰이크/소리에 한 번 밀어넣는다. */
export function applySettingsToRuntime(save: SaveData, sinks: SettingsSinks): void {
  sinks.setSoundOn(save.settings.sound);
  sinks.setFeedbackOptions({
    shakeLevel: save.settings.shakeLevel,
    vibration: save.settings.vibration,
  });
  sinks.setLeftHanded(save.settings.leftHanded);
}
