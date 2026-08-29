<!-- ★08-30: levain(르방이) 셸 릴리스 절차서를 건뿌용으로 각색 이식(ROADMAP Wave 4).
     루트≠셸 구조 차이: 건뿌는 웹 게임이 루트, 셸은 shell/ 하위 별도 패키지다.
     아래 본문에서 android/ 는 shell/android/, 프로젝트 루트 명령은 shell/ 기준으로 읽는다.
     OTA 호스팅 URL·버전 4곳 동기는 아직 미확정(TBD) — 배선 시 이 문서를 갱신할 것. -->

# 건뿌 — 빌드·릴리스 절차

> podoal 셸(`D:\podoal-shell-spike\README.md`)에서 절차만 이식. 건뿌는 **로컬 번들 셸**이라
> `server.url` 라이브 리로드·FCM·Firebase·AdMob·딥링크 관련 절차는 전부 해당 없음.
> (OTA 정적 배포처는 별개 — §8.)

## 1. 로컬 검증 (CI 없음 — GitHub Actions 비활성, 전부 로컬)

```bash
npm test              # vitest — sim 코어 전 suite
npm run build         # vite build → dist/
npm run dev           # 웹 확인 (Chrome 모바일 뷰포트)
```

## 1-1. ★APK/AAB를 새로 구우면 OTA도 같이 발행한다 (2026-08-24 실사고)

**증상**: 새로 설치한 APK가 홈으로 나갔다 오면 옛날 화면으로 되돌아간다. 브라우저(dev)는 최신인데 폰만 구버전 — "폰이랑 브라우저 버전이 다른" 상태.

**원인**: 내장 번들의 버전은 `versionName`(예 `1.0`)이다. 매니페스트에 그보다 높은 옛 OTA(예 `1.0.1`)가 떠 있으면 `ota.ts`의 비교가 `1.0.1 > 1.0`으로 판정해 **옛 번들을 받아 예약**하고, 백그라운드 복귀 시 새 APK의 웹 자산을 옛것으로 덮어쓴다. 즉 OTA가 다운그레이드로 작동한다.

**규칙**: 웹 자산(dist/에 들어가는 전부 — JS·CSS·GLB·폰트·문구·상수)을 고쳐 APK/AAB를 재빌드했으면, **같은 코드로 OTA를 한 번 더 발행**해 매니페스트를 그 이상으로 올린다.

```bash
npm run ota:release -- <versionName보다 높은 버전>   # 예: 네이티브 1.0 → 1.0.2
cd ota && npx vercel --prod --scope jirings-projects
curl -s https://gunbbu-ota.vercel.app/manifest.json   # version 확인
```

`versionName`을 올리는 빌드라면 OTA 버전도 그보다 높게 잡는다. 발행을 건너뛰려면 매니페스트가 네이티브 이하여야 한다(그 경우 OTA 자체가 무효). 적용 트리거는 §8대로 **백그라운드 전환 후 복귀**.

## 2. Android 빌드

```bash
npm run build && npx cap sync android
cd android
JAVA_HOME="D:/android-toolchain/jdk21" ./gradlew assembleDebug
# 산출물: android/app/build/outputs/apk/debug/app-debug.apk
```

- `android/local.properties`(sdk.dir)는 기기별 — 커밋 금지. 새 PC에선 `sdk.dir=D:\\android-toolchain\\sdk` 직접 생성.
- 릴리스: `./gradlew bundleRelease` → 서명 AAB.

## 3. 에뮬레이터 (D:\android-toolchain — podoal에서 검증된 조합)

```bash
cd /d/android-toolchain/sdk/emulator
ANDROID_SDK_ROOT=D:/android-toolchain/sdk ANDROID_AVD_HOME=D:/android-toolchain/avd \
  ./emulator.exe -avd podoal-spike -no-window -no-audio -no-boot-anim \
  -gpu swiftshader_indirect -feature -Vulkan
```

**함정 6가지 (podoal 실측)**:
1. `ANDROID_AVD_HOME` 안 주면 AVD를 못 찾음 (`Cannot find AVD system path`).
2. 창 모드 + Vulkan 조합에서 부팅 정지 — `-no-window` + `-feature -Vulkan`로 띄운다.
3. Git Bash에서 `adb shell am start … --es` 인자는 경로 치환으로 깨짐 —
   `MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1` 붙인다.
4. 그 환경변수를 켠 채 `adb install`하면 이번엔 APK 경로가 안 변환됨 — install은 윈도우 경로(`D:\…`)로.
5. 에뮬 네트워크가 통째로 죽는 일 있음(`Network is unreachable`) — `-wipe-data` 콜드 부팅으로만 복구.
   앱 문제로 오해하기 쉽다. (건뿌는 오프라인 앱이라 영향 적지만 진단 시 참고.)
6. 에뮬 로그를 파이프로 받으면 버퍼에 갇힘 — 파일 리다이렉트(`> emulator.log 2>&1`).

WebView 디버깅(디버그 빌드):
```bash
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof <appId>)
curl http://127.0.0.1:9222/json/list   # webSocketDebuggerUrl로 CDP 접속
```

## 4. 아이콘·스플래시

```bash
npx @capacitor/assets generate --android \
  --iconBackgroundColor "#E8D9C4" --splashBackgroundColor "#E8D9C4"
```

생성기가 만드는 밀도별 스플래시 비트맵(~19MB)은 **전부 삭제**하고
`res/drawable/splash.xml`(단색 #E8D9C4) + `styles.xml` `windowSplashScreen*`으로 대체
(아이콘 mipmap은 유지, `drawable-{land,port}*`·`drawable-night`만 제거 — podoal과 같은 정리).
아이콘 원본은 `assets/icon/`에 버전관리.

## 5. 서명·키스토어 (2026-08-23 완료)

- keystore: `D:\keys\gunbbu\gunbbu.keystore` (alias `gunbbu`), 자격증명 = `D:\keys\gunbbu\credentials.txt`.
- gradle 서명: `android/key.properties`(gitignore) — 분실 시 credentials.txt 값으로 재작성.
- 릴리스: `cd android && JAVA_HOME="D:/android-toolchain/jdk21" ./gradlew bundleRelease`
  → `android/app/build/outputs/bundle/release/app-release.aab`
- Play App Signing 사용(업로드 키 분리) 권장. **키 분실 = Play 업데이트 불가.**

## 6. appId (확정: 2026-08-23)

`com.zaballgam.gunbbu` — 사용자 확정. **Play 등록 후 변경 불가.**

## 6-1. 빌드 함정 (실측)

- **한글 경로**: AGP가 거부 → `android/gradle.properties`의 `android.overridePathCheck=true` (적용됨).
- **aapt/adb는 한글 경로 못 읽음** → APK를 ASCII 경로로 복사 후 조작.
- **Capacitor 플러그인은 정적 import 필수** — `import('@capacitor/x')` 동적 bare-import는
  WebView가 해석 못 해 조용히 null (알림·햅틱 전부 무음 실패). `src/platform/native.ts` 주석 참조.
- key.properties의 storePassword/keyPassword 둘 다 채울 것 — 하나라도 비면
  "Given final block not properly padded".

## 7. Play Console 내부테스트 제출물 체크리스트

- [ ] 서명 AAB (`bundleRelease` + keystore)
- [ ] **개인정보처리방침 URL** — 수집 데이터 0·완전 로컬이라 최단 코스. 정적 페이지 1장
      (기존 Vercel 계정에 정적 호스팅 또는 GitHub Pages)
- [ ] **Data Safety 폼** — "수집하는 데이터 없음, 제3자 공유 없음, 모든 데이터 기기 내 저장"
- [ ] 콘텐츠 등급 설문 — 전체이용가(폭력·도박·공포 요소 0)
- [ ] 스토어 등록정보: 앱 이름 "건뿌", 짧은 설명, 자세한 설명
- [ ] 아이콘 512×512 PNG
- [ ] 피처 그래픽 1024×500
- [ ] 스크린샷 최소 2장 (폰 세로)
- [ ] 내부테스트 트랙 테스터 이메일 등록
- [ ] targetSdk — 현재 `android/variables.gradle`이 **36**(Android 16). 정본은 그 파일이지 이 줄이 아니다

## 8. OTA(웹 번들 갱신)

`@capgo/capacitor-updater` — 정적 호스팅(`https://gunbbu-ota.vercel.app`, `manifest.json` + `bundles/*.zip`
두 파일뿐, 서버 로직 없음). 앱이 부팅 시 매니페스트를 읽어 새 버전이면 백그라운드로 받아 두고,
**앱을 백그라운드로 보냈다 다시 열 때** 적용한다(세션 중 화면이 갈아끼워지지 않는다).
실측 주의: 완전 종료 후 재시작만으로는 적용되지 않는다 — 홈으로 나갔다 돌아오는 전환이 트리거다. 계약·구현은
[ARCHITECTURE.md §6](ARCHITECTURE.md)·`src/platform/ota.ts` 참조.

**OTA로 되는 것 / 안 되는 것**

| 되는 것 (웹 자산, `dist/`에 들어가는 전부) | 안 되는 것 (APK/AAB 재배포 필요) |
|---|---|
| JS/CSS 번들 | 네이티브 플러그인 추가·변경 |
| 이미지·폰트·GLB 등 정적 자산 | Android 권한 |
| three.js 셰이더(.glsl) | `capacitor.config.ts`의 appId |
| UI 문구(`ui/copy.ts`) | 아이콘·스플래시 등 네이티브 리소스 |
| 게임 밸런스 상수(`sim/constants.ts`) | versionCode·versionName, AndroidManifest.xml |

**릴리스 절차**

```bash
# 0) src/version.ts의 APP_VERSION을 <version>으로 먼저 갱신 (설정 하단 표시·개발자 모드 앵커)
npm run ota:release -- <version>          # 예: 1.1.0 — build → zip → sha256 체크섬 → ota/ 산출물
# 신규 네이티브 플러그인을 전제로 한 번들이면 최소 네이티브 버전을 명시:
npm run ota:release -- <version> --min-native=<x.y>
npm run ota:release -- <version> --dry-run   # 파일 쓰기 없이 빌드·zip·체크섬만 확인

cd ota && npx vercel --prod --scope jirings-projects   # 실제 배포는 이 한 줄
```

`scripts/ota-release.mjs`가 `ota/manifest.json`(현재 배포 버전)과 `ota/history.json`(발행 이력 누적)을
같이 갱신하고, `ota/bundles/`에는 최근 4개 버전만 남기고 자동 정리한다.

**롤백**: `ota/history.json`에서 되돌릴 버전의 항목(version/url/checksum)을 찾아 그대로
`ota/manifest.json`에 덮어쓰고 다시 `cd ota && npx vercel --prod --scope jirings-projects`로 배포한다.
앱은 다음 확인 때 그 버전을 받는다. **주의**: `bundles/*.zip`은 1년 immutable 캐시로 서빙되므로
같은 파일명을 새로 쓰지 않는다 — 롤백은 기존 zip을 다시 가리키기만 할 뿐 파일을 교체하지 않는다.
4개보다 오래된 버전은 zip 자체가 정리되어 없을 수 있으니 history.json으로 존재를 먼저 확인.
**⚠️ 저장 스키마 하위호환(2026-08-24 추가)**: 저장 v2(멀티 르방) 이후 번들이 한 번이라도
사용자 기기에 저장을 쓰면, **v2를 모르는 옛 번들로 롤백 금지** — 옛 코드가 schemaVersion 2를
읽지 못해 조용히 새 게임으로 덮어쓴다(미러까지). 롤백 후보는 반드시 v2 인지 버전 중에서 고른다.

**보관 통(pantry) 경제 — 1.3.0**: 빵 굽기 원가를 mass에서 보관 통으로 옮긴 개편(GDD §6-2)은
스키마 버전을 올리지 않았다 — v2 그대로, `shared.pantry`는 무버전 추가 키다(ARCHITECTURE.md §3).
그래서 위 v1 금지와 달리 **1.2.x로 롤백해도 저장은 안전**하다 — 옛 코드가 `pantry` 키를 모를 뿐
나머지(르방·도감·경제 카운터)는 그대로 읽는다. 잃는 건 보관 통 잔량이다(떼어 둔 g이
사라짐 — 병 속 mass·산미·성장 단계는 무손실). 굽기 자체는 1.2.x 코드가 원래의 mass 게이트로
되돌아가므로 계속 가능하다.

**★"무버전 추가 키라 안전"은 키 추가에만 성립한다 — 기존 키가 담는 값의 집합이 커진 경우는 다르다**
(2026-08-26, 재료 30종 발행에서 확인). 1.3.3은 스키마 버전을 안 올렸지만 재료를 12 → 30종으로 늘렸다.
1.3.2 이하로 내려가면:

| 대상 | 결과 |
|---|---|
| 도감 발견(변형 키 포함) | **무손실** — 열거가 카탈로그를 안 보고 저장된 키를 그대로 훑는다. 롤포워드하면 되살아난다 |
| 가루·경제 카운터 | **무손실** — 베이스 레시피만 세고 상수도 그대로 |
| 르방 물리·성장·산미 | **무손실** |
| 화면 | **안 깨진다** — 교환소·굽기 모달·도감-빵이 전부 옛 카탈로그로 돌아 미지의 id를 만나지 않는다 |
| **`shared.inventory`의 신규 18종 수량** | ★**소실.** 옛 코드가 모르는 재료라 조용히 버려지고, 옛 클라이언트가 처음 저장하는 순간 **영구히** 지워진다 |

즉 롤백해도 진척은 남지만 **재료함에 쌓아둔 신규 재료는 못 돌아온다.** 발행을 막을 사유는 아니고,
롤백을 실제로 결정할 때 이걸 알고 하면 된다. 일반화: **카탈로그가 커지는 변경은 스키마 버전이
그대로여도 롤백 비대칭을 만든다** — "키를 안 늘렸으니 안전"으로 넘기지 말고 값 집합을 따로 따져라.

**zip은 커밋하지 않는다**(`.gitignore`의 `ota/bundles/` — 개당 5MB대). 따라서 과거 번들의 실체는
① 지금 배포돼 있는 Vercel 프로젝트와 ② 릴리스를 돌린 이 PC의 `ota/bundles/` 두 곳에만 있다.
다른 PC에서 `vercel --prod`를 돌리면 로컬에 없는 과거 zip이 배포본에서 사라져 롤백 URL이 404가 된다 —
새 PC에서 배포하기 전에 `ota/bundles/`를 함께 옮길 것.

**안전장치**: 앱은 부팅 즉시 `notifyAppReady()`를 호출한다(`src/platform/ota.ts`). 이걸 받지 못하면
(크래시 등으로 부팅이 안 끝나면) 플러그인이 "깨진 번들"로 판단해 다음 실행에 자동으로 이전 번들로
되돌아간다 — 별도 조치 불필요. 번들 적용은 백그라운드 전환 후 복귀에만 일어난다(세션 중 무적용).

**★새 APK/AAB를 구웠다면 OTA도 같이 발행할 것** — 매니페스트가 `versionName`보다 높은 옛 번들을 가리키고 있으면 새 APK가 백그라운드 복귀 때 옛 웹 자산으로 덮인다(다운그레이드). 절차·근거는 §1-1.

**Play 정책**: 웹 자산(JS/HTML/CSS 등) 무선 갱신은 허용 범위. 네이티브 코드·권한 교체는 금지 —
이 구조는 전자만 다루므로 해당 없음. 위 표의 "안 되는 것"이 필요해지면 통상 절차(§2~§6)로 AAB 재배포.

## 9. 릴리스 게이트

[QA.md](QA.md) 전항 통과 + vitest green + `vite build` 경고 0 이 릴리스 조건.
