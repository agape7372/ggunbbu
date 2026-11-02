// 릴리스 가드(웹 쪽) — 테스트 광고 단위가 릴리스 번들에 실려 나가는 사고를 빌드 전에 막는다.
// 켜는 법: 환경변수 GUNBBU_RELEASE=1. 꺼져 있으면 아무것도 검사하지 않는다(개발·디버그 빌드 영향 0).
// 짝: shell/android/app/build.gradle 이 릴리스 작업에서 AndroidManifest 의 테스트 앱 ID를 막는다.
//
// 표식: 릴리스 모드로 끝까지 빌드되면 `--mark`가 dist/${MARK}를 남긴다. 셸 gradle의 릴리스 작업이 앱에 실린 그 파일을 확인해,
//       GUNBBU_RELEASE=1 없이 구운 웹 번들(시험 광고 · 시험 결제 열림)이 AAB로 나가지 못하게 한다.
//
// 사용: GUNBBU_RELEASE=1 VITE_ADMOB_REWARDED_ID=ca-app-pub-실발급/단위 VITE_SELLER_INFO="상호 · 대표 · 연락처" npm run build
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** 릴리스 웹 빌드의 표식 파일 이름 — shell/android/app/build.gradle 이 같은 이름을 본다 */
export const MARK = 'release-build.txt';

/** Google 공식 테스트 광고의 발행자 번호 — 단위·앱 ID 어디에 있든 테스트 값이다. */
export const TEST_PUBLISHER = '3940256099942544';
const UNIT_RE = /^ca-app-pub-\d{16}\/\d{10}$/;

/** env를 받아 문제 목록을 돌려준다. 빈 배열이면 통과. 릴리스 모드가 아니면 항상 빈 배열. */
export function checkRelease(env) {
  if (env.GUNBBU_RELEASE !== '1') return [];
  if (env.VITE_TESTER === '1') return ['VITE_TESTER=1 이 켜져 있다 — 시험판 디버그 메뉴(전해금)가 릴리스에 실린다'];
  const id = (env.VITE_ADMOB_REWARDED_ID ?? '').trim();
  if (!id) return ['VITE_ADMOB_REWARDED_ID 가 비어 있다 — 비면 앱이 테스트 보상형 광고 단위로 돌아간다'];
  if (id.includes(TEST_PUBLISHER)) return ['VITE_ADMOB_REWARDED_ID 가 Google 테스트 단위다 — 실제 발급 값을 넣을 것'];
  if (!UNIT_RE.test(id)) return ['VITE_ADMOB_REWARDED_ID 형식이 ca-app-pub-<16자리>/<10자리> 가 아니다'];
  if (!(env.VITE_SELLER_INFO ?? '').trim()) return ['VITE_SELLER_INFO 가 비어 있다 — 꾸러미 탭의 판매자 표시(전자상거래법)가 빠진다'];
  return [];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const problems = checkRelease(process.env);
  if (process.argv.includes('--mark')) {
    if (!problems.length && process.env.GUNBBU_RELEASE === '1') writeFileSync(new URL(`../dist/${MARK}`, import.meta.url), 'GUNBBU_RELEASE=1');
    process.exit(problems.length ? 1 : 0);
  }
  if (problems.length) {
    console.error(`[check-release] 릴리스 중단\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
  console.log(process.env.GUNBBU_RELEASE === '1' ? '[check-release] 통과 (실 광고 단위)' : '[check-release] 건너뜀 (GUNBBU_RELEASE 아님)');
}
