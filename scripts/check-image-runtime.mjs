// npm run build + npm run preview 이후 첫 설치 오프라인과 PNG 폴백을 확인한다.
import { mkdirSync } from 'node:fs';
import { cliOption, optionalPackage, projectPath, readProjectJson, writeProjectJson } from './lib/workspace.mjs';
import { openTitle, startArcade, showDebugMenu } from './lib/game-browser.mjs';
import { runtimeImagePaths } from './lib/offline-shell.mjs';
const { chromium } = optionalPackage('playwright', '--playwright-module');
const url = cliOption('--url', 'http://127.0.0.1:5175');
const browser = await chromium.launch({headless:true});
const errors=[];
mkdirSync(projectPath('assets/ref/image-qa'), {recursive:true});
try {
  const context=await browser.newContext({viewport:{width:375,height:812}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await openTitle(page, url);
  await startArcade(page);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{}, {timeout:15000});
  const cache=await page.evaluate(async()=>{
    const keys=(await caches.keys()).filter(key=>key.startsWith('gunbbu-'));
    if(keys.length!==1)throw Error(`Expected one active game cache, got ${keys.length}`);
    const [key]=keys;
    return {key,urls:(await(await caches.open(key)).keys()).map(r=>new URL(r.url).pathname)};
  });
  const manifest=readProjectJson('src/assets/manifest.json');
  const baseUrl=url.endsWith('/')?url:`${url}/`;
  const images=runtimeImagePaths(manifest).map(file=>new URL(file,baseUrl).pathname);
  const missing=images.filter(path=>!cache.urls.includes(path));
  if(missing.length)throw Error(`not precached: ${missing.join(', ')}`);
  await context.setOffline(true);await openTitle(page,url);await startArcade(page);
  const offline=await page.evaluate(()=>({tick:window.__app.getState().tick,mode:window.__app.getState().mode}));
  await showDebugMenu(page, false);
  await page.screenshot({path:projectPath('assets/ref/image-qa/offline.png')});
  const fallbackContext=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'});
  const fallbackPage=await fallbackContext.newPage();
  fallbackPage.on('pageerror',e=>errors.push(e.message));
  await fallbackPage.route('**/img/**',route=>route.abort());
  await openTitle(fallbackPage,url);await startArcade(fallbackPage);
  const fallback=await fallbackPage.evaluate(()=>({tick:window.__app.getState().tick,mode:window.__app.getState().mode}));
  const report={cache:cache.key,precachedRuntimeImages:images.length,offline,fallback,errors};
  writeProjectJson('assets/ref/image-qa/production-smoke.json',report);
  console.log(report);if(errors.length)process.exitCode=1;
} finally { await browser.close(); }
