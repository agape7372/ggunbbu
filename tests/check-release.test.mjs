// 릴리스 가드(BL-01): GUNBBU_RELEASE=1일 때만 검사하고, 테스트·빈·잘못된 광고 단위는 막는다.
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRelease, releaseEnv } from '../scripts/check-release.mjs';

const REAL = 'ca-app-pub-1234567890123456/1234567890';
const SELLER = '건뿌 · 대표 · 010-0000-0000';
const TEST = 'ca-app-pub-3940256099942544/5224354917';
const script = fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url));

it('릴리스 모드가 아니면 아무것도 검사하지 않는다', () => {
  expect(checkRelease({})).toEqual([]);
  expect(checkRelease({ VITE_ADMOB_REWARDED_ID: TEST })).toEqual([]);
});

it('릴리스 모드: 빈 값·테스트 단위·잘못된 형식은 실패, 실 단위는 통과', () => {
  const on = { GUNBBU_RELEASE: '1' };
  expect(checkRelease({ ...on })).toHaveLength(1);
  expect(checkRelease({ ...on, VITE_ADMOB_REWARDED_ID: '  ' })).toHaveLength(1);
  expect(checkRelease({ ...on, VITE_ADMOB_REWARDED_ID: TEST })[0]).toMatch(/테스트/);
  expect(checkRelease({ ...on, VITE_ADMOB_REWARDED_ID: 'abc' })[0]).toMatch(/형식/);
  expect(checkRelease({ ...on, VITE_ADMOB_REWARDED_ID: REAL })[0]).toMatch(/VITE_SELLER_INFO/);
  expect(checkRelease({ ...on, VITE_ADMOB_REWARDED_ID: REAL, VITE_SELLER_INFO: SELLER })).toEqual([]);
  expect(checkRelease({ ...on, VITE_ADMOB_REWARDED_ID: REAL, VITE_TESTER: '1' })[0]).toMatch(/VITE_TESTER/);
  expect(checkRelease({ VITE_TESTER: '1' })).toEqual([]); // 시험판(릴리스 아님)은 통과
});

it('릴리스 모드: 판매자 표시가 8자 미만이면 실패', () => {
  const on = { GUNBBU_RELEASE: '1', VITE_ADMOB_REWARDED_ID: REAL };
  expect(checkRelease({ ...on, VITE_SELLER_INFO: '.' })[0]).toMatch(/VITE_SELLER_INFO/);
  expect(checkRelease({ ...on, VITE_SELLER_INFO: ' 1234567 ' })[0]).toMatch(/VITE_SELLER_INFO/);
  expect(checkRelease({ ...on, VITE_SELLER_INFO: '12345678' })).toEqual([]);
});

// 명령줄은 Vite(loadEnv)를 불러 한 번에 1초 남짓 — 전체 시험 부하에선 기본 5초를 넘는다. cwd는 .env 파일이 없는 곳
it('명령줄: 릴리스 모드 + 테스트 단위는 종료 코드 1, 평소엔 0', () => {
  const run = (env) => spawnSync(process.execPath, [script], { cwd: tmpdir(), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  expect(run({ GUNBBU_RELEASE: '1', VITE_ADMOB_REWARDED_ID: TEST }).status).toBe(1);
  expect(run({ GUNBBU_RELEASE: '1', VITE_ADMOB_REWARDED_ID: REAL, VITE_SELLER_INFO: SELLER }).status).toBe(0);
  expect(run({}).status).toBe(0);
}, 60_000);

it('Vite가 굽는 .env 파일 값도 본다 — .env.local 의 VITE_TESTER=1 은 셸 env가 깨끗해도 막는다(--mark 포함)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-env-'));
  try {
    writeFileSync(join(dir, '.env.local'), 'VITE_TESTER=1');
    const env = { GUNBBU_RELEASE: '1', VITE_ADMOB_REWARDED_ID: REAL, VITE_SELLER_INFO: SELLER };
    expect(checkRelease(releaseEnv(dir, env))[0]).toMatch(/VITE_TESTER/);
    expect(checkRelease(releaseEnv(dir, { ...env, VITE_TESTER: '' }))).toEqual([]); // 셸 env가 이긴다 — Vite가 굽는 값과 같다
    const run = (args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
    expect(run([]).status).toBe(1);
    expect(run(['--mark']).status).toBe(1);
    writeFileSync(join(dir, '.env.production'), 'VITE_ADMOB_REWARDED_ID=ca-app-pub-3940256099942544/5224354917');
    expect(checkRelease(releaseEnv(dir, { GUNBBU_RELEASE: '1', VITE_TESTER: '', VITE_SELLER_INFO: SELLER }))[0]).toMatch(/테스트/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

it('셸 build.gradle 이 릴리스 작업에서 매니페스트의 테스트 앱 ID를 막고 -PallowTestAds 로만 우회시킨다', () => {
  const gradle = readFileSync(new URL('../shell/android/app/build.gradle', import.meta.url), 'utf8');
  expect(gradle).toContain('3940256099942544');
  expect(gradle).toContain("allowTestAds");
  expect(gradle).toMatch(/GradleException/);
});

it('셸 build.gradle 이 릴리스 작업에서 앱에 실린 capacitor.config.json 의 server.url 을 막고 -PallowServerUrl 로만 우회시킨다', () => {
  const gradle = readFileSync(new URL('../shell/android/app/build.gradle', import.meta.url), 'utf8');
  expect(gradle).toContain('src/main/assets/capacitor.config.json');
  expect(gradle).toContain('allowServerUrl');
  expect(gradle).toMatch(/server\?\.url/);
});

it('레포 .env.production 의 광고 단위 · ads.ts 의 LIVE_MIN_BUILD · 셸 gradle 짝(실 ID를 출시 빌드에만)', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  expect(checkRelease(releaseEnv(root, { GUNBBU_RELEASE: '1', VITE_TESTER: '' }))).toEqual([]); // 실 단위 형식 · 테스트 발행자 아님 · 판매자 표시
  const live = /LIVE_MIN_BUILD = (\d+)/.exec(readFileSync(new URL('../src/platform/ads.ts', import.meta.url), 'utf8'));
  expect(live).not.toBeNull();
  const gradle = readFileSync(new URL('../shell/android/app/build.gradle', import.meta.url), 'utf8');
  expect(gradle).toContain('LIVE_MIN_BUILD'); // gradle 이 같은 상수를 읽어 시험 앱 ID + 높은 코드 · 실 앱 ID + 낮은 코드를 막는다
  expect(gradle).toContain('manifestPlaceholders');
  expect(readFileSync(new URL('../shell/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')).toContain('${admobAppId}');
});
