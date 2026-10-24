# 건뿌 이미지 납품 — 2026-09-06

`docs/IMAGE_PROMPTS.md` 필수 제작 항목을 게임에 적용하고 스토어 파일까지 저장했다. 외부 업로드는 수행하지 않았다.

| 파일 | 치수 | 내용 |
|---|---|---|
| `title-kv.png` | 360×640 | 졸라맨·낙하 건물·집행기 세로 키 비주얼 |
| `feature-graphic.png` | 1024×500 | 같은 세계관의 가로 배너, 문자 없음 |
| `icon-512.png` | 512×512 | 불투명 앱 아이콘 |
| `shot-01-9x16.png` | 360×640 | 실제 타이틀 화면 |
| `shot-02-9x16.png` | 360×640 | 실제 1막 건물 낙하 화면 |
| `shot-03-9x16.png` | 360×640 | 실제 집행기 보스 대치 화면 |
| `shot-04-9x16.png` | 360×640 | 실제 버터바 화면 |
| `shot-01.png` ~ `shot-04.png` | 375×812 | 문서에 지정된 모바일 뷰포트 원본 4장 |

스크린샷은 게임의 DOM·Canvas 그대로다. QA 메뉴로 장면에 진입하고 낙하 위치를 정지해 촬영했으며, 디버그 메뉴만 숨겼다. HUD와 조작 버튼은 실제 게임 UI다. 375×812는 9:16이 아니어서 정확한 9:16 뷰포트도 별도로 촬영했다.

## 재현

- `npm run dev`로 개발 서버 실행. 필요하면 `-- --port 5174`처럼 빈 포트를 지정한다.
- `npm run images:capture -- --url http://127.0.0.1:5174 --playwright-module <Playwright 패키지 경로>`로 재촬영한다. Playwright는 작업용이며 게임 런타임 의존성이 아니다.
- 이미지 변환: `npm run images:prepare -- assets/ref/image-production-jobs.json --sharp-module <sharp 패키지 경로>`.
- PWA 아이콘 배치: `npm run icons`. imagegen 정본에서 축소한 `assets/brand/`의 192/512 PNG를 복사하므로 과거 얼굴 아이콘을 재생성하지 않는다.
- 오프라인 검사: 빌드 후 preview 서버를 열고 `npm run images:check -- --url http://127.0.0.1:5175 --playwright-module <Playwright 패키지 경로>`.
- 원본과 실제 프롬프트: `assets/ref/generated/`, `assets/ref/image-production-prompts.json`. 층 행 절단 좌표와 최종 치수: `assets/ref/image-production-jobs.json`.

## 검수

- 런타임 PNG 19장으로 매니페스트 21키 충족(배경 2키는 modern 파일 공유).
- 159개 테스트, 타입 검사, 프로덕션 빌드 및 용량 예산 통과.
- `assets/ref/image-qa/`에 실제 층·유리·얼음 화면과 검사 결과를 보관했다.
- 생성 원본에 미세한 채움 편차는 있을 수 있다. 최종 크기에서 포즈, 층 구조, 빈 고리/가시 탄환의 구분, 노랑 위치를 확인했다.
