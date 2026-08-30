# 건뿌 셸 (Capacitor Android)

루트(`../`)는 런타임 의존성 0의 웹 게임 — 네이티브 의존성은 전부 이 폴더에 격리한다.
웹 ↔ 네이티브 브리지는 `window.Capacitor.Plugins.*` 런타임 조회만 사용
(정적 import·동적 bare import 금지 — 동적 import는 WebView에서 조용히 null이 된다).

## 짝값 표 — 한쪽만 바꾸면 조용히 깨진다 (podoal-shell 방법론)

| 값 | 셸 위치 | 웹/기타 위치 | 깨지면 |
|---|---|---|---|
| appId `com.zaballgam.gunbbu` | capacitor.config.ts | Play 콘솔 (등록 후 불변) | 재설치 불가·별개 앱 |
| versionCode / versionName | android/app/build.gradle | `../ota/manifest.json` · `../src/version.ts`(ota:release가 갱신) | OTA가 다운그레이드로 작동 — `npm run version:native`가 두 값을 같이 올리고 다음 OTA 버전을 알려준다 |
| AdMob APPLICATION_ID | android/…/AndroidManifest.xml meta-data | AdMob 콘솔 | **앱 기동 즉시 크래시** |
| AdMob 리워드 단위 ID | ../src/platform/ads.ts REWARDED_AD_UNIT_ID | AdMob 콘솔 광고 단위 | 광고 무조건 실패(원인 은폐) |
| 배경색 #F4F1E8 | capacitor.config.ts | ../src/style.css | 상태바 뒤 흰 띠 |

## 빌드 절차 (요지 — 정본은 ../docs/RELEASE.md)

```bash
cd shell
npm install
npm run web:build     # 루트 build → www 복사
npx cap sync android
cd android && gradlew assembleDebug
```

한글 경로 함정: `android/gradle.properties`의 `android.overridePathCheck=true` 필수 (levain 실측).
