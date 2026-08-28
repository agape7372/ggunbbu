// 캐시 버전: 변경 시점마다 갱신해야 한다 (배포 시 사용자 캐시 무효화)
const CACHE_VERSION = 'gunbbu-v4';
const CACHE_PREFIX = 'gunbbu-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

// 앱 셸: 게임 로드에 필요한 정적 자산 (Vite 해시 파일명은 runtime 캐시 → cache-first)
// 상대 경로 = SW 스코프 기준 → GitHub Pages 서브경로(/ggunbbu/)에서도 유효
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/bg/europe.png',
  './img/bg/asia.png',
  './img/bg/eastasia.png',
  './img/bg/modern.png',
  './img/bg/act2.png',
  './img/bg/moon.png',
];

function addShell(cache) {
  // addAll은 하나라도 404면 설치 전체가 실패한다. 아이콘 부재 때도 SW가 살아있게 개별 add.
  return Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {})));
}

// 설치: 앱 셸 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(addShell)
  );
  self.skipWaiting();
});

// 캐시 정리: 이전 버전 gunbbu 캐시 삭제
function shouldDeleteCache(key, currentCacheName) {
  return key.startsWith(CACHE_PREFIX) && key !== currentCacheName;
}

// 활성화: 이전 버전 캐시 제거
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => shouldDeleteCache(key, CACHE_NAME))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  // SW 스크립트는 브라우저 업데이트 검사가 가로채면 안 됨
  if (path.endsWith('/sw.js')) return false;
  // 루트 앵커(/^\/icons/)는 Pages 서브경로에서 실패 → 경로 어디에든 매칭
  if (path.endsWith('manifest.webmanifest') || path.endsWith('.webmanifest')) return true;
  if (/\/(icons|assets|img)\//.test(path)) return true;
  return /\.(svg|png|jpg|jpeg|webp|ico|woff2?|js|css)$/.test(path);
}

// Fetch: 네비게이션은 네트워크-우선(3초 레이스 → 캐시 폴백), 정적 자산은 캐시-우선
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // POST 등 비-GET 요청은 SW 개입 없음
  if (request.method !== 'GET') return;

  // HTML 네비게이션(문서): 네트워크-우선, 3초 타임아웃 레이스
  // 느린 회선에서 무한 대기 방지 — 3초 후 캐시 폴백
  if (request.mode === 'navigate') {
    const NAV_TIMEOUT_MS = 3000;
    let putDone = Promise.resolve();
    const networkFetch = fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        putDone = caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, clone))
          .catch(() => {});
      }
      return response;
    });
    event.respondWith(
      (async () => {
        const raced = await Promise.race([
          networkFetch.then(
            (res) => ({ kind: 'network', res }),
            () => ({ kind: 'offline' })
          ),
          new Promise((resolve) =>
            setTimeout(() => resolve({ kind: 'timeout' }), NAV_TIMEOUT_MS)
          ),
        ]);
        if (raced.kind === 'network') return raced.res;
        if (raced.kind === 'timeout') {
          const cached = await caches.match(request);
          if (cached) {
            event.waitUntil(networkFetch.then(() => putDone, () => {}));
            return cached;
          }
          // 캐시 없음(첫 방문) → 네트워크 끝까지 기다림
          return networkFetch.catch(() => caches.match('./'));
        }
        // 오프라인 → 캐시 또는 홈(루트) 폴백
        return (await caches.match(request)) || (await caches.match('./'));
      })()
    );
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
