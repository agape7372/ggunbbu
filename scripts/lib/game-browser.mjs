export async function openTitle(page, baseUrl) {
  const url = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('debug', '1');
  await page.goto(url.href);
  await page.getByText('탭하여 시작', { exact: true }).click();
  await page.getByRole('button', { name: '아케이드 시작', exact: true }).waitFor();
}

export async function startArcade(page) {
  await page.getByRole('button', { name: '아케이드 시작', exact: true }).click();
  await page.waitForFunction(() => window.__app.getState()?.tick > 5);
}

export async function showDebugMenu(page, visible) {
  await page.locator('#debug-menu').evaluate((element, show) => {
    element.style.display = show ? '' : 'none';
  }, visible);
}
