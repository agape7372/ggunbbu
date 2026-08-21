// 렌더러 ↔ 오디오 얇은 브리지 (위임 산출 API를 렌더러 계약에 맞춤).
import { playSfx as raw } from './audio';
import type { SfxName } from './sfx';

export type SfxNameOf = SfxName;

export function playSfx(name: SfxName, semitones = 0): void {
  raw(name, semitones !== 0 ? { pitchSemitones: semitones } : undefined);
}
