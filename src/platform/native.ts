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
 * 부팅 즉시 1회 호출 — CapacitorUpdater가 이 신호를 못 받으면 OTA 번들을
 * 부팅 실패로 판단해 롤백한다(levain 실측). 웹·플러그인 부재에선 무해 no-op.
 */
export function notifyAppReady(): void {
  void plugin('CapacitorUpdater')?.notifyAppReady?.().catch(() => undefined);
}

/**
 * 진동 — 네이티브면 Haptics, 아니면 navigator.vibrate. 어느 쪽도 throw 하지 않는다.
 * 설정 게이트는 호출부(renderer)가 이미 진다.
 */
export function vibrate(pattern: number | readonly number[]): void {
  const h = plugin('Haptics');
  if (h?.vibrate) {
    const total = typeof pattern === 'number'
      ? pattern
      : pattern.reduce((a, b) => a + b, 0);
    void h.vibrate({ duration: Math.min(total, 400) }).catch(() => undefined);
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
    void app.addListener('appStateChange', ((st: { isActive: boolean }) => emit(st.isActive)) as unknown as never)
      .catch(() => undefined);
  }
}
