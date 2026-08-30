// OTA(웹 번들 무선 갱신) — platform 층에 격리. core·render·ui는 이 파일의 존재를 모른다.
//
// 계약 3줄 (levain src/platform/ota.ts 정본 이식):
//   ① 부팅 즉시 notifyAppReady() — 안 부르면 플러그인이 "깨진 번들"로 보고 이전 번들로 롤백한다.
//      ★건뿌는 이 호출을 main.ts 최상단이 이미 한다(native.notifyAppReady). 여기서 또 부르지 않는다.
//   ② 세션 중에는 절대 화면을 갈아끼우지 않는다 — 받아만 두고 next()로 예약한다.
//      ⚠ 실측(levain 에뮬 2026-08-23): 적용 시점은 "앱 종료 후 재시작"이 아니라
//      **백그라운드로 나갔다 돌아올 때**다. force-stop → 재시작만으로는 내장 번들이 계속 뜬다.
//   ③ 네트워크는 있으면 좋은 것 — 실패는 조용히 삼킨다. 오프라인에서도 게임은 완전히 동작한다.
//
// ★levain과의 차이: 여기서는 `@capgo/capacitor-updater`를 import 하지 않는다.
// 루트 런타임 의존성 0이 이 레포의 불변 규칙이라(CLAUDE.md), 플러그인은 shell/에만 있고
// 웹은 `window.Capacitor.Plugins.CapacitorUpdater` 런타임 조회로만 접근한다(native.ts와 같은 패턴).
import { isNative, nativePlugin } from './native';

/** 정적 배포처 — 서버 로직 없음(manifest.json + bundles/*.zip 두 종류뿐) */
const OTA_BASE = 'https://gunbbu-ota.vercel.app';
const MANIFEST_URL = `${OTA_BASE}/manifest.json`;
const FETCH_TIMEOUT_MS = 6000;
/** 부팅 경로를 막지 않게 확인을 뒤로 미루는 시간 */
const CHECK_DELAY_MS = 3000;

interface OtaManifest {
  version: string;
  url: string;
  checksum: string;
  size?: number;
  releasedAt?: string;
  /** 이 번들이 요구하는 최소 네이티브 버전 — 낮은 셸이면 건너뛴다 */
  minNative?: string;
}

interface BundleInfo {
  id: string;
  version: string;
}

/** CapacitorUpdater 중 우리가 쓰는 메서드만. 없으면 null(웹·플러그인 부재) */
function updater(): {
  current: () => Promise<{ bundle: BundleInfo; native: string }>;
  list: () => Promise<{ bundles: BundleInfo[] }>;
  download: (o: { url: string; version: string; checksum: string }) => Promise<BundleInfo>;
  next: (o: { id: string }) => Promise<unknown>;
  delete: (o: { id: string }) => Promise<unknown>;
} | null {
  const p = nativePlugin('CapacitorUpdater');
  if (!p || typeof p.current !== 'function' || typeof p.download !== 'function') return null;
  return p as unknown as ReturnType<typeof updater>;
}

/** "1.2.3" 비교 — a>b면 1, 같으면 0, a<b면 -1. 숫자 아닌 조각은 0으로 본다 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** 매니페스트 형식 검사 — 필드가 하나라도 어긋나면 "업데이트 없음"으로 본다 */
export function parseManifest(json: unknown): OtaManifest | null {
  if (typeof json !== 'object' || json === null) return null;
  const m = json as Record<string, unknown>;
  if (typeof m.version !== 'string' || typeof m.url !== 'string' || typeof m.checksum !== 'string') return null;
  return {
    version: m.version,
    url: m.url,
    checksum: m.checksum,
    size: typeof m.size === 'number' ? m.size : undefined,
    releasedAt: typeof m.releasedAt === 'string' ? m.releasedAt : undefined,
    minNative: typeof m.minNative === 'string' ? m.minNative : undefined,
  };
}

async function fetchManifest(): Promise<OtaManifest | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return parseManifest(await res.json());
  } catch {
    return null; // 오프라인·타임아웃·형식 오류 — 전부 "업데이트 없음"과 같게 취급
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 부팅 시 1회 호출. 조용히 새 번들을 확인해 다음 실행분으로 예약만 한다.
 * 반환값 없음 — UI는 OTA를 기다리지 않는다.
 */
export function initOta(): void {
  if (!isNative()) return; // 웹(브라우저·PWA)에선 OTA 개념 자체가 없다 — 새로고침이 곧 갱신
  if (!updater()) return; // 플러그인 미탑재 셸
  setTimeout(() => void checkAndStage(), CHECK_DELAY_MS);
}

async function checkAndStage(): Promise<void> {
  const up = updater();
  if (!up) return;
  try {
    const manifest = await fetchManifest();
    if (!manifest) return;

    const cur = await up.current();
    const currentVersion = cur.bundle.version; // 내장 번들이면 "builtin"
    const nativeVersion = cur.native;

    // 네이티브가 요구 버전보다 낮으면 이 번들은 못 쓴다 (플러그인 추가 등 — APK 재배포 몫)
    if (manifest.minNative && compareVersions(nativeVersion, manifest.minNative) < 0) return;

    // builtin은 버전 비교 대상이 아니다 — 매니페스트가 네이티브보다 새로우면 받는다
    const base = currentVersion === 'builtin' ? nativeVersion : currentVersion;
    if (compareVersions(manifest.version, base) <= 0) return;

    // 이미 받아 둔 같은 버전이 있으면 다시 받지 않는다
    const list = await up.list();
    const staged = list.bundles.find((b) => b.version === manifest.version);
    const bundle = staged ?? (await up.download({
      url: manifest.url,
      version: manifest.version,
      checksum: manifest.checksum,
    }));

    // 다음 앱 시작(백그라운드 복귀)에 적용 — 세션 중 화면을 갈아끼우지 않는다
    await up.next({ id: bundle.id });

    // 오래된 번들 정리 — 현재/다음 것만 남긴다
    for (const b of list.bundles) {
      if (b.id !== bundle.id && b.version !== currentVersion) {
        await up.delete({ id: b.id }).catch(() => undefined);
      }
    }
  } catch {
    // 다운로드 실패·체크섬 불일치·디스크 부족 — 전부 조용히 넘어간다. 다음 실행에 다시 시도.
  }
}
