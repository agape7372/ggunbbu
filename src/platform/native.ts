// 네이티브 셸 브리지 — window.Capacitor.Plugins 런타임 조회만 사용한다.
// ★정적 import·동적 bare import 금지: 정적은 웹 번들 오염, 동적 bare import는
// WebView가 못 풀어 조용히 null이 된다(levain RELEASE.md §6-1 실측). podoal 검증 패턴.
// 루트 런타임 의존성 0 유지 — Capacitor 패키지는 shell/에만 있다.

type CapGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>> | undefined>;
};

function cap(): CapGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapGlobal }).Capacitor ?? null;
}

/** 네이티브 셸 안에서 도는 중인가 */
export function isNative(): boolean {
  try {
    return cap()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function plugin(name: string): Record<string, (...a: unknown[]) => Promise<unknown>> | null {
  try {
    return cap()?.Plugins?.[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * 같은 런타임 조회를 platform 층의 다른 포트(ota.ts 등)도 쓴다 — 조회 경로를 한 군데로 묶어
 * 정적/동적 import가 새로 생기지 않게 한다. 부재 시 null, throw 없음.
 */
export const nativePlugin = plugin;

/**
 * 부팅 즉시 1회 호출 — CapacitorUpdater가 이 신호를 못 받으면 OTA 번들을
 * 부팅 실패로 판단해 롤백한다(levain 실측). 웹·플러그인 부재에선 무해 no-op.
 */
export function notifyAppReady(): void {
  void plugin('CapacitorUpdater')?.notifyAppReady?.().catch(() => undefined);
}

/** 진동 한 번(세그먼트). at = 패턴 시작부터 몇 ms 뒤에 쏘는가, ms = 얼마나 울리는가. */
export interface VibeStep { at: number; ms: number }

/** 한 번에 울릴 수 있는 상한 — 긴 한 방이 기기를 오래 잡지 않게. */
const VIBE_MAX_MS = 400;

/**
 * 웹 Vibration 패턴([진동, 휴지, 진동, …])을 세그먼트로 푼다. 짝수 칸 = 진동, 홀수 칸 = 휴지.
 * 숫자 하나는 진동 한 번. 0 이하는 건너뛴다. 순수 함수 — 시험이 직접 부른다.
 */
export function vibrationSteps(pattern: number | readonly number[]): VibeStep[] {
  if (typeof pattern === 'number') return pattern > 0 ? [{ at: 0, ms: Math.min(pattern, VIBE_MAX_MS) }] : [];
  const steps: VibeStep[] = [];
  let at = 0;
  pattern.forEach((v, i) => {
    if (i % 2 === 0 && v > 0) steps.push({ at, ms: Math.min(v, VIBE_MAX_MS) });
    at += v;
  });
  return steps;
}

let vibeChain: ReturnType<typeof setTimeout>[] = [];
function cancelVibeChain(): void {
  for (const t of vibeChain) clearTimeout(t);
  vibeChain = [];
}

/**
 * 진동 — 네이티브면 Haptics, 아니면 navigator.vibrate. 어느 쪽도 throw 하지 않는다.
 * 네이티브 Haptics.vibrate는 길이 하나만 받으므로 패턴을 세그먼트로 풀어 setTimeout 체인으로 순서대로 쏜다.
 * 새 패턴이 오면 이전 체인은 끊는다(웹 navigator.vibrate가 패턴을 갈아끼우는 것과 같다).
 * 설정 게이트는 호출부(renderer)가 이미 진다.
 */
export function vibrate(pattern: number | readonly number[]): void {
  cancelVibeChain();
  const h = plugin('Haptics');
  if (h?.vibrate) {
    for (const { at, ms } of vibrationSteps(pattern)) {
      const fire = (): void => {
        try { void h.vibrate!({ duration: ms }).catch(() => undefined); } catch { /* 동기 throw도 삼킨다 */ }
      };
      if (at <= 0) fire();
      else vibeChain.push(setTimeout(fire, at));
    }
    return;
  }
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern as number | number[]);
  } catch { /* 미지원 무시 */ }
}

/**
 * 전경/배경 전환 구독 — visibilitychange(웹)와 appStateChange(네이티브)를 합치고
 * 두 소스의 이중 발화를 마지막 상태 비교로 1회만 흘린다(levain lifecycle 이식).
 */
export function onLifecycle(cb: (fg: boolean) => void): void {
  let last: boolean | null = null;
  const emit = (fg: boolean): void => {
    if (last === fg) return;
    last = fg;
    cb(fg);
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => emit(!document.hidden));
  }
  const app = plugin('App');
  if (app?.addListener) {
    try {
      void app.addListener('appStateChange', ((st: { isActive: boolean }) => emit(st.isActive)) as unknown as never)
        .catch(() => undefined);
    } catch { /* 동기 throw도 삼킨다 — 라이프사이클 구독 실패가 부팅을 못 막게 */ }
  }
}

/**
 * 안드로이드 뒤로가기 구독 — ★리스너가 하나라도 붙으면 Capacitor 기본 동작(웹뷰 뒤로·앱 종료)이 꺼진다.
 * 그래서 호출부가 스스로 닫기·최소화를 책임져야 한다. 웹·플러그인 부재에선 no-op.
 */
export function onBackButton(cb: () => void): void {
  const app = plugin('App');
  if (!app?.addListener) return;
  try {
    void app.addListener('backButton', cb as unknown as never).catch(() => undefined);
  } catch { /* 구독 실패가 부팅을 못 막게 */ }
}

/** 앱을 백그라운드로 보낸다(종료 아님). 웹·플러그인 부재에선 no-op. */
export function minimizeApp(): void {
  void plugin('App')?.minimizeApp?.().catch(() => undefined);
}

/** 설치된 앱의 스토어 버전(versionName). 웹·플러그인 부재·실패면 null. */
export async function nativeAppVersion(): Promise<string | null> {
  try {
    const info = (await plugin('App')?.getInfo?.()) as { version?: string } | undefined;
    return info?.version ?? null;
  } catch {
    return null;
  }
}
