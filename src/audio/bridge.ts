// 렌더러 ↔ 오디오 얇은 브리지 (구 API 유지). 인게임 SFX는 consume.ts가 events를 소비한다.
import { playSfx as raw } from './audio';
import type { SfxName } from './sfx';

export type SfxNameOf = SfxName;
export type { SfxName };

export function playSfx(name: SfxName, semitones = 0): void {
  raw(name, semitones !== 0 ? { pitchSemitones: semitones } : undefined);
}
