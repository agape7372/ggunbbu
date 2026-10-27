// 릴리스 가드(BL-01): GUNBBU_RELEASE=1일 때만 검사하고, 테스트·빈·잘못된 광고 단위는 막는다.
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { checkRelease } from '../scripts/check-release.mjs';

const REAL = 'ca-app-pub-1234567890123456/1234567890';
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
  expect(checkRelease({ ...on, VITE_ADMOB_REWARDED_ID: REAL })).toEqual([]);
});

it('명령줄: 릴리스 모드 + 테스트 단위는 종료 코드 1, 평소엔 0', () => {
  const run = (env) => spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  expect(run({ GUNBBU_RELEASE: '1', VITE_ADMOB_REWARDED_ID: TEST }).status).toBe(1);
  expect(run({ GUNBBU_RELEASE: '1', VITE_ADMOB_REWARDED_ID: REAL }).status).toBe(0);
  expect(run({}).status).toBe(0);
});

it('셸 build.gradle 이 릴리스 작업에서 매니페스트의 테스트 앱 ID를 막고 -PallowTestAds 로만 우회시킨다', () => {
  const gradle = readFileSync(new URL('../shell/android/app/build.gradle', import.meta.url), 'utf8');
  expect(gradle).toContain('3940256099942544');
  expect(gradle).toContain("allowTestAds");
  expect(gradle).toMatch(/GradleException/);
});
