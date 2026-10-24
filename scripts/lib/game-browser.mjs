export async function openTitle(page, baseUrl) {
  const url = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('debug', '1');
  await page.goto(url.href);
  await page.locator('[data-screen="boot"]:not([hidden])').click();
  // 첫 실행이면 조작 안내가 뜬다 — 닫는다
  const howto = page.locator('.ov-modal:not([hidden]) .cta');
  if (await howto.isVisible().catch(() => false)) await howto.click();
  await page.locator('[data-act="arcade"]').waitFor();
}

export async function startArcade(page) {
  await page.locator('[data-act="arcade"]').click();
  const story = page.locator('[data-screen="story"]:not([hidden])');
  await story.waitFor({ timeout: 1500 }).then(() => story.click()).catch(() => {});
  await page.waitForFunction(() => window.__app.getState()?.tick > 5);
}

export async function showDebugMenu(page, visible) {
  await page.locator('#debug-menu').evaluate((element, show) => {
    element.style.display = show ? '' : 'none';
  }, visible);
}
