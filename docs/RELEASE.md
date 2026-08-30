<!-- ★08-30: levain(르방이) 셸 릴리스 절차서를 건뿌용으로 각색 이식(ROADMAP Wave 4).
     루트≠셸 구조 차이: 건뿌는 웹 게임이 루트, 셸은 shell/ 하위 별도 패키지다.
     아래 본문에서 android/ 는 shell/android/, 프로젝트 루트 명령은 shell/ 기준으로 읽는다.
     ★08-30 갱신: OTA는 배선 완료(§8) — 호스팅 gunbbu-ota.vercel.app, 버전 출처는 src/version.ts 하나. -->

# 건뿌 — 빌드·릴리스 절차

> podoal 셸(`D:\podoal-shell-spike\README.md`)에서 절차만 이식. 건뿌는 **로컬 번들 셸**이라
> `server.url` 라이브 리로드·FCM·Firebase·AdMob·딥링크 관련 절차는 전부 해당 없음.
> (OTA 정적 배포처는 별개 — §8.)

## 1. 로컬 검증 (+ GitHub Actions는 Pages 배포에 살아 있다 — push마다 test·build)

```bash
npm test              # vitest — sim 코어 전 suite
npm run build         # vite build → dist/
npm run dev           # 웹 확인 (Chrome 모바일 뷰포트)
```

## 1-1. ★APK/AAB를 새로 구우면 OTA도 같이 발행한다 (levain 2026-08-24 실사고)

**증상**: 새로 설치한 APK가 홈으로 나갔다 오면 옛날 화면으로 되돌아간다. 브라우저(dev)는 최신인데 폰만 구버전 — "폰이랑 브라우저 버전이 다른" 상태.

**원인**: 내장 번들의 버전은 `versionName`(예 `1.0`)이다. 매니페스트에 그보다 높은 옛 OTA(예 `1.0.1`)가 떠 있으면 `ota.ts`의 비교가 `1.0.1 > 1.0`으로 판정해 **옛 번들을 받아 예약**하고, 백그라운드 복귀 시 새 APK의 웹 자산을 옛것으로 덮어쓴다. 즉 OTA가 다운그레이드로 작동한다.

**규칙**: 웹 자산(dist/에 들어가는 전부 — JS·CSS·이미지·문구·상수)을 고쳐 APK/AAB를 재빌드했으면, **같은 코드로 OTA를 한 번 더 발행**해 매니페스트를 그 이상으로 올린다.

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

- 버전 올리기: 루트에서 `npm run version:native -- <versionName> [versionCode]` —
  gradle 두 값을 같이 올리고 다음에 발행할 OTA 버전까지 알려준다(내려가는 값은 거부).
- 스토어 등록정보·Data Safety·콘텐츠 등급 답변 원고: [STORE_LISTING.md](STORE_LISTING.md).
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

## 5. 서명·키스토어 (★미생성 — 사용자 작업)

★2026-08-30 확인: `D:\keys\gunbbu\`는 **없다**. 이 절은 levain 절차서를 이식하며 "완료"로 잘못
따라온 문장이었다(levain은 `D:\keys\levain\`에 실재). 릴리스 AAB를 굽기 전에 새로 만들어야 한다.

```bash
# 예시 — 비밀번호는 사용자가 정하고 credentials.txt에 같이 남긴다
keytool -genkeypair -v -keystore D:/keys/gunbbu/gunbbu.keystore \
  -alias gunbbu -keyalg RSA -keysize 2048 -validity 10000
```

- 생성 후: `shell/android/key.properties`(gitignore) 작성 — storeFile·storePassword·keyAlias·keyPassword.
- **키 분실 = Play 업데이트 영구 불가.** 생성 즉시 keystore와 credentials.txt를 별도 백업.
- 릴리스: `cd android && JAVA_HOME="D:/android-toolchain/jdk21" ./gradlew bundleRelease`
  → `android/app/build/outputs/bundle/release/app-release.aab`
- Play App Signing 사용(업로드 키 분리) 권장.

## 6. appId (확정: 2026-08-30)

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
- [ ] **개인정보처리방침 URL** — 페이지는 작성됨(`ota/privacy.html`). OTA 배포처를 한 번
      올리면 `https://gunbbu-ota.vercel.app/privacy.html`이 그대로 제출 URL이 된다(§8)
- [ ] **광고 동의(UMP)** — AdMob 초기화만 있고 유럽(EEA·영국) 동의 절차는 **미구현**.
      배포 국가를 한국 등으로 좁히거나, EEA를 포함하려면 UMP를 붙인 뒤 제출할 것
- [ ] **Data Safety 폼** — "수집하는 데이터 없음, 제3자 공유 없음, 모든 데이터 기기 내 저장"
- [ ] 콘텐츠 등급 설문 — 전체이용가(폭력·도박·공포 요소 0)
- [ ] 스토어 등록정보: 앱 이름 "건뿌", 짧은 설명, 자세한 설명
- [ ] 아이콘 512×512 PNG
- [ ] 피처 그래픽 1024×500
- [ ] 스크린샷 최소 2장 (폰 세로)
- [ ] 내부테스트 트랙 테스터 이메일 등록
- [ ] targetSdk — 현재 `android/variables.gradle`이 **36**(Android 16). 정본은 그 파일이지 이 줄이 아니다

## 8. OTA(웹 번들 갱신) — 2026-08-30 배선 완료

`@capgo/capacitor-updater`(shell/ 의존성) + 정적 호스팅 `https://gunbbu-ota.vercel.app`
(`manifest.json` + `bundles/*.zip` 두 파일뿐, 서버 로직 없음). 앱이 부팅 3초 뒤 매니페스트를 읽고
새 버전이면 백그라운드로 받아 두었다가, **앱을 백그라운드로 보냈다 다시 열 때** 적용한다
(세션 중에는 화면이 갈아끼워지지 않는다). 완전 종료 후 재시작만으로는 적용되지 않는다 —
홈으로 나갔다 돌아오는 전환이 트리거다(levain 에뮬 실측).

구현: `src/platform/ota.ts`(웹측, 플러그인 접근은 `window.Capacitor.Plugins` 런타임 조회만 —
루트 런타임 의존성 0 불변) · `shell/capacitor.config.ts`의 `CapacitorUpdater` 블록(autoUpdate off,
Capgo 클라우드 URL 3종 공백으로 차단) · `scripts/ota-release.mjs`(패키저).

**OTA로 되는 것 / 안 되는 것**

| 되는 것 (웹 자산, `dist/`에 들어가는 전부) | 안 되는 것 (APK/AAB 재배포 필요) |
|---|---|
| JS/CSS 번들 | 네이티브 플러그인 추가·변경 |
| 이미지(`public/img/`)·아이콘·매니페스트 | Android 권한 |
| 게임 밸런스 상수(`src/config.ts`) | `capacitor.config.ts`의 appId |
| UI 문구(`src/content/`) | 아이콘·스플래시 등 네이티브 리소스 |
| 에셋 매니페스트(`src/assets/manifest.json`) | versionCode·versionName, AndroidManifest.xml |

**릴리스 절차**

```bash
npm run ota:release -- <version>             # 예: 1.0.1 — 빌드 → zip → sha256 → ota/ 산출물
npm run ota:release -- <version> --dry-run   # 파일 쓰기 없이 빌드·zip·체크섬만 확인
npm run ota:release -- <version> --min-native=<x.y>   # 새 네이티브 플러그인을 전제한 번들이면

cd ota && npx vercel --prod --scope jirings-projects   # 실제 배포는 이 한 줄
curl -s https://gunbbu-ota.vercel.app/manifest.json   # version 확인
```

스크립트가 하는 일(levain 정본 + 건뿌 보강 3가지):

- **`src/version.ts`를 직접 갱신한다** — 번들 안 버전(설정 화면 표시)과 매니페스트 버전이
  어긋날 수 없게. levain은 이게 수동이라 그 파일에 "⚠ 수동 갱신" 경고가 붙어 있었다.
  발행 후 이 변경분을 **커밋할 것**.
- **셸 `versionName`과 비교해 죽은 발행을 막는다** — OTA는 네이티브보다 높은 버전만 적용된다.
  현재 셸은 `versionName "1.0"`이므로 첫 OTA는 `1.0.1` 이상.
- **워킹트리가 더러우면 경고한다** — zip은 지금 작업 중인 파일을 그대로 싣는다(옆 세션 동승 사고 방지).
- 그리고 `dist/`를 파일 단위로 먼저 비운다 — ★디렉터리째 `rmSync(recursive)`는 이 환경에서
  **에러 없이 실패한다**(DEVLOG 08-30 `cpSync` 무음 크래시와 같은 계열). 안 비우면 지난 빌드
  누적분이 번들에 통째로 실린다(levain 실측: 440개 42.6MB가 네 번의 릴리스에 섞여 나갔다).

`ota/manifest.json`(현재 배포 버전)과 `ota/history.json`(발행 이력)을 같이 갱신하고,
`ota/bundles/`에는 최근 4개만 남기고 자동 정리한다.

**롤백**: `ota/history.json`에서 되돌릴 버전의 항목(version/url/checksum)을 그대로
`ota/manifest.json`에 덮어쓰고 다시 `cd ota && npx vercel --prod --scope jirings-projects`. 앱은 다음 확인 때 그 버전을 받는다.
`bundles/*.zip`은 1년 immutable 캐시라 같은 파일명을 새로 쓰지 않는다 — 롤백은 기존 zip을 다시
가리킬 뿐이다. 4개보다 오래된 버전은 zip이 정리돼 없을 수 있으니 history.json으로 먼저 확인.

**★저장 하위호환**: 건뿌 세이브는 `src/storage.ts`의 사다리(`parse → migrate → clamp`)로 읽는다.
버전 키가 낮거나 손상돼도 항목별로 구제되므로 **옛 번들로 롤백해도 기록이 전멸하지 않는다**
(08-30 Wave 2에서 전멸 경로 제거, `tests/storage.test.ts`가 가드). 다만 새 번들에서 추가된
필드(새 코스메틱·새 기록 항목)는 옛 코드가 모르므로 옛 클라이언트가 저장하는 순간 **버려질 수 있다**.
일반화: 키를 늘린 변경은 롤백해도 안전하고, **값 집합(카탈로그)이 커진 변경은 롤백 비대칭을 만든다**.

**zip은 커밋하지 않는다**(`.gitignore`의 `ota/bundles/`). 과거 번들의 실체는 ① 배포돼 있는 Vercel
프로젝트와 ② 릴리스를 돌린 이 PC의 `ota/bundles/` 두 곳뿐이다 — 다른 PC에서 `vercel --prod`를
돌리면 로컬에 없는 과거 zip이 배포본에서 사라져 롤백 URL이 404가 된다.

**안전장치**: 앱은 부팅 즉시 `notifyAppReady()`를 호출한다(`src/main.ts` 최상단 → `platform/native.ts`).
못 받으면 플러그인이 "깨진 번들"로 판단해 다음 실행에 이전 번들로 자동 복귀한다(`appReadyTimeout` 10초).

**★서비스 워커**: 네이티브 셸에서는 SW를 등록하지 않고 기존 등록을 해제한다(`src/main.ts`).
셸도 `http://localhost` 오리진이라 SW가 살아 있으면 OTA로 갈아끼운 새 번들 위에 옛 캐시를
계속 서빙해 무선 갱신이 조용히 무효가 된다. 웹(브라우저)에서는 그대로 등록한다 — 오프라인 PWA 경로.

**★새 APK/AAB를 구웠다면 OTA도 같이 발행할 것** — 매니페스트가 `versionName`보다 높은 옛 번들을
가리키고 있으면 새 APK가 백그라운드 복귀 때 옛 웹 자산으로 덮인다(다운그레이드). 근거는 §1-1.

**Play 정책**: 웹 자산(JS/HTML/CSS·이미지) 무선 갱신은 허용 범위. 네이티브 코드·권한 교체는 금지 —
이 구조는 전자만 다루므로 해당 없음. 위 표의 "안 되는 것"이 필요해지면 통상 절차(§2~§6)로 AAB 재배포.

**개인정보처리방침 호스팅**: 같은 정적 배포처가 `privacy.html`도 서빙한다 —
`https://gunbbu-ota.vercel.app/privacy.html` (Play 콘솔 §7 체크리스트의 URL 항목).


## 9. 릴리스 게이트

[QA.md](QA.md) 전항 통과 + vitest green + `vite build` 경고 0 이 릴리스 조건.
