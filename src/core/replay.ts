// 판 기록 코드 — 시뮬이 결정론이라 시드 · 장비 · 입력열만 있으면 같은 판이 그대로 다시 돈다.
// 입력은 틱마다 4비트다(점프 · 베기 · 필살 = 엣지, 가드 = 누르고 있음). 바뀐 틱만 (간격, 무엇)으로 적는다.
// 문자열 = 'GB' + 형식 판 + '.' + base64url(바이트). 끝 4바이트는 FNV-1a — 옮겨 적다 틀린 코드를 거른다.
// DOM 없음(core 규칙). base64도 여기서 직접 한다 — btoa는 브라우저 · 노드마다 있는지가 다르다.

import type { InputFrame, WazaId, WeaponId } from './types';

/** 바이트 배치 판. 배치를 바꾸면 올린다 — 옛 코드는 읽지 않는다 */
export const REPLAY_FORMAT = 1;

/** 코드 하나가 담을 수 있는 판 길이(10분). 검증도 여기서 멈춘다 */
export const REPLAY_MAX_TICKS = 60 * 60 * 10;

export interface ReplayHead {
  /** 시뮬 판(STAGE_SIM_VERSION). 지금 판과 다르면 같은 입력이라도 다른 판이 나온다 → 재생하지 않는다 */
  sim: number;
  stage: string;
  diff: number;
  seed: number;
  weapon: WeaponId;
  waza: WazaId;
}

export interface ReplayEnd {
  /** 판정 시간(judgeStage ticks — 깬 틱, 못 깼으면 끝난 틱). 깬 뒤 쓰러짐 연출 틱은 안 들어가서 입력 사건이 이보다 뒤에 있을 수 있다 */
  ticks: number;
  score: number;
  cleared: boolean;
}

export interface Replay {
  head: ReplayHead;
  end: ReplayEnd;
  /** (앞 사건과의 틱 간격) × 8 + 사건 번호 */
  events: number[];
}

const C_JUMP = 0;
const C_ATTACK = 1;
const C_SPECIAL = 2;
const C_GUARD_ON = 3;
const C_GUARD_OFF = 4;

export interface ReplayRecorder {
  /** advance에 넘긴 바로 그 프레임을 넣는다 */
  push(f: InputFrame): void;
  readonly ticks: number;
  readonly events: readonly number[];
}

export function createRecorder(): ReplayRecorder {
  let t = 0;
  let last = 0;
  let guard = false;
  const events: number[] = [];
  const add = (code: number): void => {
    events.push((t - last) * 8 + code);
    last = t;
  };
  return {
    push(f) {
      if (f.jump) add(C_JUMP);
      if (f.attack) add(C_ATTACK);
      if (f.special) add(C_SPECIAL);
      if (f.guard !== guard) { guard = f.guard; add(guard ? C_GUARD_ON : C_GUARD_OFF); }
      t += 1;
    },
    get ticks() { return t; },
    events,
  };
}

/** 사건 열 → 틱마다 프레임. 끝을 지나면 빈 입력(가드는 마지막 상태 유지) */
export function createPlayback(events: readonly number[]): { next(): InputFrame } {
  let t = 0;
  let i = 0;
  let at = events.length > 0 ? Math.floor(events[0] / 8) : Infinity;
  let guard = false;
  return {
    next() {
      const f: InputFrame = { jump: false, guard, attack: false, special: false };
      while (i < events.length && at === t) {
        const code = events[i] % 8;
        if (code === C_JUMP) f.jump = true;
        else if (code === C_ATTACK) f.attack = true;
        else if (code === C_SPECIAL) f.special = true;
        else if (code === C_GUARD_ON) guard = true;
        else if (code === C_GUARD_OFF) guard = false;
        i += 1;
        at = i < events.length ? at + Math.floor(events[i] / 8) : Infinity;
      }
      f.guard = guard;
      t += 1;
      return f;
    },
  };
}

// ── 바이트 ───────────────────────────────────────────────────────

function pushVarint(out: number[], n: number): void {
  let v = Math.max(0, Math.floor(n));
  while (v >= 0x80) { out.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
  out.push(v);
}

function pushStr(out: number[], s: string): void {
  out.push(s.length);
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0x7f);
}

function fnv1a(bytes: ArrayLike<number>, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) s += B64[n & 63];
  }
  return s;
}

export function fromBase64Url(s: string): number[] | null {
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buf = ((buf << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return out;
}

/** 확인 번호 — 코드 끝 체크섬의 앞 6자(16진). 결과 보고서 · 공유 글에 찍는 짧은 증거 */
export function replayCheck(code: string): string {
  const t = code.replace(/\s+/g, '');
  const bytes = fromBase64Url(t.slice(t.indexOf('.') + 1)) ?? [];
  let h = 0;
  for (let i = Math.max(0, bytes.length - 4); i < bytes.length; i++) h = h * 256 + bytes[i];
  return h.toString(16).padStart(8, '0').slice(0, 6).toUpperCase();
}

export function encodeReplay(r: Replay): string {
  const out: number[] = [REPLAY_FORMAT];
  pushVarint(out, r.head.sim);
  pushStr(out, r.head.stage);
  out.push(r.head.diff & 0xff);
  const seed = r.head.seed >>> 0;
  out.push(seed & 0xff, (seed >>> 8) & 0xff, (seed >>> 16) & 0xff, (seed >>> 24) & 0xff);
  pushStr(out, r.head.weapon);
  pushStr(out, r.head.waza);
  pushVarint(out, r.end.ticks);
  pushVarint(out, r.end.score);
  out.push(r.end.cleared ? 1 : 0);
  pushVarint(out, r.events.length);
  for (const e of r.events) pushVarint(out, e);
  const h = fnv1a(out, out.length);
  out.push(h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff, (h >>> 24) & 0xff);
  return `GB${REPLAY_FORMAT}.${toBase64Url(out)}`;
}

/** 틀린 코드 · 다른 형식 판 · 잘린 코드는 null. 붙여 넣기 앞뒤 공백 · 줄바꿈은 무시한다 */
export function decodeReplay(text: string): Replay | null {
  const t = text.replace(/\s+/g, '');
  const prefix = `GB${REPLAY_FORMAT}.`;
  if (!t.startsWith(prefix)) return null;
  const bytes = fromBase64Url(t.slice(prefix.length));
  if (!bytes || bytes.length < 8) return null;
  const n = bytes.length - 4;
  const want = (bytes[n] | (bytes[n + 1] << 8) | (bytes[n + 2] << 16) | (bytes[n + 3] << 24)) >>> 0;
  if (fnv1a(bytes, n) !== want) return null;

  let i = 0;
  let bad = false;
  const u8 = (): number => {
    if (i >= n) { bad = true; return 0; }
    return bytes[i++];
  };
  const varint = (): number => {
    let v = 0;
    let mul = 1;
    for (let k = 0; k < 8; k++) {
      const b = u8();
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
    }
    bad = true;
    return 0;
  };
  const str = (): string => {
    const len = u8();
    let s = '';
    for (let k = 0; k < len; k++) s += String.fromCharCode(u8());
    return s;
  };

  if (u8() !== REPLAY_FORMAT) return null;
  const sim = varint();
  const stage = str();
  const diff = u8();
  const seed = (u8() | (u8() << 8) | (u8() << 16) | (u8() << 24)) >>> 0;
  const weapon = str() as WeaponId;
  const waza = str() as WazaId;
  const ticks = varint();
  const score = varint();
  const cleared = u8() === 1;
  const count = varint();
  const events: number[] = [];
  let sum = 0;
  for (let k = 0; k < count && !bad; k++) {
    const e = varint();
    sum += Math.floor(e / 8);
    events.push(e);
  }
  if (bad || i !== n || sum > REPLAY_MAX_TICKS) return null;
  return { head: { sim, stage, diff, seed, weapon, waza }, end: { ticks, score, cleared }, events };
}
