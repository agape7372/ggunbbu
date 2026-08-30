// PWA 설치 유도 — podoal InstallPrompt 이식 (React 제거, 런타임 의존성 0).
// beforeinstallprompt 지연 + iOS Safari 3단계 안내 + 7일 스누즈.
// 스타일은 인라인(style.css 충돌 회피). 플레이 중에는 숨긴다.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'gunbbu.installDismissed';
const DISMISS_DAYS = 7;
const STYLE_ID = 'gunbbu-install-style';

let mounted = false;

export function mountInstallPrompt(): void {
  if (mounted || typeof window === 'undefined') return;
  if (isStandalone()) return;
  if (isSnoozed()) return;

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

  if (isIOS && isSafari) {
    mounted = true;
    renderBanner('ios', null);
    return;
  }

  const onPrompt = (e: Event): void => {
    e.preventDefault();
    if (mounted) return;
    mounted = true;
    renderBanner('prompt', e as BeforeInstallPromptEvent);
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Date.parse(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
  } catch {
    /* quota / private mode */
  }
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ★08-30: 이 층은 style.css와 분리돼 있어 개편에서 빠지기 쉽다 — 같은 규칙을 손으로 맞춘다.
       획 1.5px · 드롭섀도우 없음 · 터치 44px · 안내는 중앙 팝업(바닥 시트 금지). */
    #install-prompt{position:fixed;bottom:8px;left:8px;right:8px;z-index:200;pointer-events:none}
    #install-prompt .ip-card{pointer-events:auto;max-width:360px;margin:0 auto;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1.5px solid #1A1A20;background:#F4F1E8;font-family:system-ui,sans-serif;color:#1A1A20}
    #install-prompt .ip-copy{flex:1;min-width:0}
    #install-prompt .ip-title{font-size:13px;font-weight:800;line-height:1.2}
    #install-prompt .ip-sub{font-size:11px;color:#6E695F;margin-top:2px}
    #install-prompt button{border:1.5px solid #1A1A20;background:#FFD200;color:#1A1A20;font-size:12px;font-weight:800;padding:6px 10px;min-height:44px;min-width:44px;cursor:pointer}
    #install-prompt button:active{background:#1A1A20;color:#FFD200}
    #install-prompt .ip-x{background:#F4F1E8;min-width:44px;padding:0}
    #install-prompt .ip-x:active{background:#1A1A20;color:#F4F1E8}
    #install-guide{position:fixed;inset:0;z-index:210;background:rgba(26,26,32,.45);display:flex;align-items:center;justify-content:center;padding:16px}
    #install-guide .ip-sheet{width:100%;max-width:320px;background:#F4F1E8;border:1.5px solid #1A1A20;padding:18px 16px}
    #install-guide h2{font-size:18px;text-align:center;margin:0 0 12px}
    #install-guide ol{margin:0 0 12px;padding:0;list-style:none}
    #install-guide li{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.4;margin:0 0 8px}
    #install-guide .ip-num{flex:0 0 22px;height:22px;border:1.5px solid #1A1A20;border-radius:50%;text-align:center;font-weight:800;font-size:12px;line-height:19px}
    #install-guide .ip-note{font-size:11px;color:#6E695F;text-align:center;margin:0 0 12px}
    #install-guide button{display:block;width:100%;min-height:44px;border:1.5px solid #1A1A20;background:#FFD200;font-weight:800;padding:10px;cursor:pointer}
    #install-guide button:active{background:#1A1A20;color:#FFD200}
  `;
  document.head.appendChild(style);
}

function renderBanner(mode: 'prompt' | 'ios', deferred: BeforeInstallPromptEvent | null): void {
  ensureStyle();
  const wrap = document.createElement('div');
  wrap.id = 'install-prompt';
  wrap.innerHTML = `
    <div class="ip-card">
      <div class="ip-copy">
        <p class="ip-title">홈 화면에 추가</p>
        <p class="ip-sub">${mode === 'ios' ? '공유 → 홈 화면에 추가. 설치하면 바로 열립니다.' : '앱처럼 전체화면으로 엽니다.'}</p>
      </div>
      <button type="button" class="ip-x" aria-label="닫기">×</button>
      <button type="button" class="ip-go">${mode === 'ios' ? '방법 보기' : '설치'}</button>
    </div>
  `;
  document.body.appendChild(wrap);
  watchStage(wrap);

  const close = (): void => {
    snooze();
    wrap.remove();
    document.getElementById('install-guide')?.remove();
  };

  wrap.querySelector('.ip-x')?.addEventListener('click', close);
  wrap.querySelector('.ip-go')?.addEventListener('click', async () => {
    if (mode === 'ios') {
      showIosGuide();
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') wrap.remove();
  });
}

function showIosGuide(): void {
  if (document.getElementById('install-guide')) return;
  const sheet = document.createElement('div');
  sheet.id = 'install-guide';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', '홈 화면에 추가하는 방법');
  sheet.innerHTML = `
    <div class="ip-sheet">
      <h2>홈 화면에 추가하는 방법</h2>
      <ol>
        <li><span class="ip-num">1</span><span>Safari 하단의 공유 버튼을 누른다</span></li>
        <li><span class="ip-num">2</span><span>「홈 화면에 추가」를 찾아 누른다</span></li>
        <li><span class="ip-num">3</span><span>오른쪽 위 「추가」를 누르면 끝</span></li>
      </ol>
      <p class="ip-note">설치하면 홈에서 바로 열립니다. 알림은 쓰지 않습니다.</p>
      <button type="button">확인</button>
    </div>
  `;
  const dismiss = (): void => { sheet.remove(); };
  sheet.addEventListener('click', (e) => { if (e.target === sheet) dismiss(); });
  sheet.querySelector('button')?.addEventListener('click', dismiss);
  document.body.appendChild(sheet);
}

function watchStage(banner: HTMLElement): void {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const sync = (): void => {
    const hide = stage.classList.contains('playing') || stage.classList.contains('paused');
    banner.style.display = hide ? 'none' : '';
  };
  sync();
  new MutationObserver(sync).observe(stage, { attributes: true, attributeFilter: ['class'] });
}
