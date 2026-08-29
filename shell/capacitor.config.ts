// 건뿌 로컬 번들 셸 — server.url 없음. 루트 웹 빌드(dist → www)가 앱에 실린다.
// 구조: levain 셸 정본 이식(2026-08-30, ROADMAP Wave 4). 웹 코드는 네이티브 모듈을
// import하지 않고 window.Capacitor.Plugins.* 런타임 조회만 쓴다(podoal 검증 패턴).
// ⚠ appId는 Play 등록 후 변경 불가 — 등록 전까지는 바꿀 수 있다.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zaballgam.gunbbu',
  appName: '건뿌',
  webDir: 'www',
  // 상태바 뒤 흰 띠 방지 — 앱 배경색과 일치 (levain 에뮬 실측)
  backgroundColor: '#F4F1E8',
  plugins: {
    // OTA — 자동 모드 금지. 확인·다운로드·적용 시점을 웹측 ota 포트가 직접 쥔다
    // (세션 중 화면 교체 금지·오프라인 우선). 정본: docs/RELEASE.md OTA 절.
    CapacitorUpdater: {
      autoUpdate: 'off',
      // ⚠ 기본값은 Capgo 클라우드로 향한다 — 빈 문자열로 전부 차단 (levain 방침 이식).
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      resetWhenUpdate: true,
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
  },
};

export default config;
