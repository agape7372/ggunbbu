# 건뿌!! (GUNBBU)

하늘에서 떨어지는 건물을 베어 부수는 B급 병맛 모바일 웹 액션. 2004년 고전 프리게임 '건물부수기' 장르의 오마주(메커니즘 재현, 에셋 전부 오리지널).

## 플레이

**https://agape7372.github.io/ggunbbu/**

폰 브라우저로 열고 공유 → "홈 화면에 추가"하면 앱처럼 전체화면으로 실행되고 오프라인에서도 동작한다.

## 특징

- **낙하물 베기 + 가드 + 필살기**
- **스토리 진행으로 해금되는 건축양식 챕터 4종** — 유럽, 아시아, 동아시아, 현대
- **버터바 이벤트 스테이지** — 1겹~100겹
- **2막 보스전** — 건물을 집어 던지는 철거 집게보 집행기
- **토코톤 엔드리스**
- **PWA 오프라인 지원**

## 조작

- 모바일 터치 버튼 4개(점프 · 공격 · 가드 · 필살)
- 키보드 `↑`(점프) `↓`(가드) + `Z`(공격) `X`(필살기)

## 개발

```bash
npm install              # 의존성 설치
npm run dev              # 개발 서버 실행
npm test                 # 테스트 실행
npm run build            # 프로덕션 빌드
```

이미지 작업물은 이 저장소에 통합되어 있다. 런타임 PNG는 `public/img/`, 스토어 파일은
`assets/store/`, 생성 원본·프롬프트는 `assets/ref/`에 보관한다.

아이콘 배치와 이미지 관리:
```bash
npm run icons
npm run images:prepare -- --sharp-module <sharp 패키지 경로>
npm run images:capture -- --url http://127.0.0.1:5174 --playwright-module <Playwright 패키지 경로>
npm run images:check -- --url http://127.0.0.1:5175 --playwright-module <Playwright 패키지 경로>
```

촬영에는 dev 서버, 오프라인 검사에는 build 후 preview 서버가 필요하다. `sharp`와
Playwright는 작업용 외부 도구이며 런타임 의존성은 아니다. 전체 산출물은
[이미지 안내](assets/store/README.md), 제작 사양은 [IMAGE_PROMPTS](docs/IMAGE_PROMPTS.md)를 참고한다.

## 기술 스택

- **프레임워크**: Vite + TypeScript
- **렌더링**: 순수 Canvas 2D
- **사운드**: WebAudio API 신스
- **런타임 의존성**: 0
