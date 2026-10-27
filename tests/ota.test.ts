// ★08-30 Wave 4: OTA 포트 가드 — 웹에서 조용해야 하고, 매니페스트는 형식이 어긋나면 무시한다.
// 다운로드 경로 자체는 네이티브 플러그인 몫이라 여기서 테스트하지 않는다(계약만 가드).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { compareVersions, parseManifest, initOta } from '../src/platform/ota';

describe('OTA 버전 비교', () => {
  it('자리별로 숫자 비교한다 (문자열 비교가 아니다)', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1); // 문자열이면 '1'<'9'로 뒤집힌다
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.1')).toBe(0);
  });

  it('길이가 달라도 빠진 자리는 0으로 본다 — 셸 versionName "1.0"과 비교 가능해야 한다', () => {
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  it('숫자 아닌 조각은 0 — "builtin" 같은 값이 들어와도 throw 하지 않는다', () => {
    expect(compareVersions('builtin', '0.0.0')).toBe(0);
  });
});

describe('매니페스트 파싱', () => {
  const BASE = 'https://ota.example.com';
  const ok = { version: '1.0.1', url: `${BASE}/bundles/1.0.1.zip`, checksum: 'abc' };

  it('필수 3필드가 있고 번들 주소가 배포처 https 아래면 통과', () => {
    expect(parseManifest(ok, BASE)?.version).toBe('1.0.1');
  });

  it('필수 필드가 하나라도 없거나 타입이 다르면 null — 조용히 "업데이트 없음"이 된다', () => {
    expect(parseManifest({ ...ok, checksum: undefined }, BASE)).toBeNull();
    expect(parseManifest({ ...ok, version: 1 }, BASE)).toBeNull();
    expect(parseManifest(null, BASE)).toBeNull();
    expect(parseManifest('nope', BASE)).toBeNull();
  });

  it('번들 주소가 평문 http·남의 호스트·표기 장난이면 null (T9: 매니페스트가 임의 번들을 끌어오지 못한다)', () => {
    const withUrl = (url: string) => parseManifest({ ...ok, url }, BASE);
    expect(withUrl('http://ota.example.com/bundles/1.zip')).toBeNull();            // 평문
    expect(withUrl('https://evil.example.net/bundles/1.zip')).toBeNull();          // 다른 호스트
    expect(withUrl('https://ota.example.com.evil.net/bundles/1.zip')).toBeNull();  // 접두사만 같은 호스트
    expect(withUrl('https://ota.example.com@evil.net/bundles/1.zip')).toBeNull();  // userinfo 장난
    expect(withUrl('https://ota.example.com\\@evil.net/x.zip')).toBeNull();        // 역슬래시
    expect(withUrl('/bundles/1.zip')).toBeNull();                                  // 상대 주소
    expect(withUrl(`${BASE}/bundles/1.zip`)?.url).toBe(`${BASE}/bundles/1.zip`);
  });

  it('배포처가 비었거나 http면 어떤 주소도 받지 않는다 (OTA 꺼짐 = 기본값)', () => {
    expect(parseManifest(ok, '')).toBeNull();
    expect(parseManifest({ ...ok, url: 'http://ota.example.com/b.zip' }, 'http://ota.example.com')).toBeNull();
    expect(parseManifest(ok)).toBeNull(); // 테스트 환경은 VITE_OTA_BASE 없음
  });

  it('VITE_OTA_BASE 끝의 슬래시는 떼어 쓴다 — 안 떼면 //manifest.json·//bundles가 된다', async () => {
    vi.stubEnv('VITE_OTA_BASE', 'https://ota.example.com//');
    vi.resetModules();
    const fresh = await import('../src/platform/ota');
    expect(fresh.parseManifest(ok)?.url).toBe(ok.url); // 기본 base = 환경값(슬래시 제거본)
    vi.unstubAllEnvs();
  });

  it('선택 필드는 타입이 어긋나면 버리되 파싱은 성공', () => {
    const m = parseManifest({ ...ok, size: 'big', minNative: '1.0' }, BASE);
    expect(m?.size).toBeUndefined();
    expect(m?.minNative).toBe('1.0');
  });
});

describe('웹에서의 침묵', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).Capacitor;
    delete (globalThis as Record<string, unknown>).window;
    vi.restoreAllMocks();
  });

  it('네이티브가 아니면 매니페스트를 아예 받아오지 않는다 (브라우저는 새로고침이 곧 갱신)', () => {
    const f = vi.fn();
    (globalThis as Record<string, unknown>).fetch = f;
    (globalThis as Record<string, unknown>).window = globalThis; // Capacitor 전역 없음 = 웹
    initOta();
    expect(f).not.toHaveBeenCalled();
  });

  it('네이티브라도 플러그인이 없으면 no-op — 옛 셸에서 throw 하지 않는다', () => {
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>).Capacitor = { isNativePlatform: () => true, Plugins: {} };
    const f = vi.fn();
    (globalThis as Record<string, unknown>).fetch = f;
    expect(() => initOta()).not.toThrow();
    expect(f).not.toHaveBeenCalled(); // 플러그인 부재면 확인 자체를 예약하지 않는다
  });
});
