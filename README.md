# 건뿌!! (GUNBBU)

하늘에서 떨어지는 건물을 베어 부수는 B급 병맛 모바일 웹 액션. 고전 프리게임 '건물 부수기' 장르의 오마주(메커니즘 재현, 에셋 전부 오리지널).

## 플레이

**https://agape7372.github.io/ggunbbu/**

폰 브라우저로 열고 공유 → "홈 화면에 추가"하면 앱처럼 전체화면으로 실행되고 오프라인에서도 동작한다.

## 특징

- **낙하물 베기 + 가드 + 필살기** — 필살 여섯, 무기 스물두 자루
- **아케이드** — 1막 네 구역(서쪽 회랑 · 강턱 시장 · 기와능선 · 철근 해안), 2막 보스 집행기
- **작업 지시서** — 열세 장, 견습 · 정규 · 외주 세 난이도
- **구역 작전** — 구역을 골라 시작. 2막을 깨면 특별작전 넷(유리 골목 · 빙결 부두 · 야간 투척 · 궤도 직하)이 열린다
- **야근** — 엔드리스
- **버터바 챌린지** — 세 회차, 마지막은 100겹 타워
- **마스크 도트판** — 16×16으로 직접 그려 졸라맨에 씌운다
- **PWA 오프라인 지원**

## 조작

- 모바일 터치 버튼 4개(점프 · 공격 · 가드 · 필살)
- 키보드 `↑`(점프) `↓`(가드) + `Z`(공격) `X`(필살기) · `Esc`(멈춤)

## 개발

```bash
npm install              # 의존성 설치
npm run dev              # 개발 서버 실행 (포트 5173)
npm test                 # 테스트 실행
npm run typecheck        # 타입 검사
npm run build            # 프로덕션 빌드 (릴리스 · 예산 검사 포함)
```

Android 셸(Capacitor)은 `shell/`에 따로 있고 절차는 [RELEASE](docs/RELEASE.md), 스토어 원고는 [STORE_LISTING](docs/STORE_LISTING.md), 프로젝트 규칙은 `CLAUDE.md`를 본다.

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
