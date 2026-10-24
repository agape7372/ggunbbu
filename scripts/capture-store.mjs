// 실제 게임 DOM/Canvas 캡처. 개발 서버와 작업용 Playwright가 필요하다.
// node scripts/capture-store.mjs --url http://127.0.0.1:5174 --playwright-module <package directory>
import { mkdirSync } from 'node:fs';
import { cliOption, optionalPackage, projectPath, writeProjectJson } from './lib/workspace.mjs';
import { openTitle, startArcade, showDebugMenu } from './lib/game-browser.mjs';
const { chromium } = optionalPackage('playwright', '--playwright-module');
const url = cliOption('--url', 'http://127.0.0.1:5174');
mkdirSync(projectPath('assets/store'), {recursive:true});
mkdirSync(projectPath('assets/ref/image-qa'), {recursive:true});
const browser = await chromium.launch({headless:true});
const report = {source:url, captures:[], errors:[], imageFailures:[]};
try {
  for (const viewport of [{width:375,height:812},{width:360,height:640}]) {
    const page = await browser.newPage({viewport,deviceScaleFactor:1});
    page.on('pageerror', e=>report.errors.push(e.message));
    page.on('response', r=>{if(r.url().includes('/img/')&&!r.ok())report.imageFailures.push(r.url());});
    await openTitle(page, url);
    await showDebugMenu(page, false);
    const capture = async (number,scene) => {
      await page.waitForTimeout(120);
      const file=`assets/store/shot-0${number}${viewport.width===360?'-9x16':''}.png`;
      await page.screenshot({path:projectPath(file)}); report.captures.push({file,scene,...viewport});
    };
    await capture(1,'title');
    await startArcade(page);
    // 렌더러는 그대로 사용하고 QA 상태에서 낙하 위치만 정지한다.
    await page.evaluate(async()=>{
      const {makeStack,makeFloor}=await import('/src/core/building.ts');
      const s=window.__app.getState();
      s.stack=makeStack({variant:'normal',theme:'europe',floors:['mid','weak','mid','hard','mid'].map(makeFloor),y:110});
      s.hitstop=10000;
    });
    await capture(2,'act1');
    await showDebugMenu(page, true);
    await page.getByRole('button',{name:'집행기',exact:true}).click();
    await page.evaluate(()=>{window.__app.getState().hitstop=0;});
    await page.waitForFunction(()=>window.__app.getState().boss?.st==='idle');
    await page.evaluate(()=>{window.__app.getState().hitstop=10000;});
    await showDebugMenu(page, false);
    await capture(3,'executor');
    await showDebugMenu(page, true);
    await page.getByRole('button',{name:'버터1',exact:true}).click();
    await page.evaluate(()=>{
      const s=window.__app.getState();s.boss=null;s.act2Phase=null;s.hitstop=0;s.stackSpawnCd=0;
    });
    await page.waitForFunction(()=>!!window.__app.getState().stack);
    await page.evaluate(()=>{const s=window.__app.getState();s.stack.y=150;s.hitstop=10000;});
    await showDebugMenu(page, false);
    await capture(4,'butter');
    if(viewport.width===360){
      for(const [theme,gimmick] of [['asia','none'],['eastasia','none'],['modern','none'],['modern','glass'],['eastasia','ice']]){
        await page.evaluate(async({theme,gimmick})=>{
          const {makeStack,makeFloor}=await import('/src/core/building.ts');const s=window.__app.getState();
          s.mode='act1';s.bonus=null;s.gimmick=gimmick;s.chapter=['europe','asia','eastasia','modern'].indexOf(theme);
          s.stack=makeStack({variant:'normal',theme,floors:['mid','weak','mid','hard','mid'].map(makeFloor),y:90});s.hitstop=10000;
        },{theme,gimmick});
        await page.waitForTimeout(100);
        await page.screenshot({path:projectPath(`assets/ref/image-qa/${gimmick==='none'?theme:gimmick}.png`)});
      }
    }
    await page.close();
  }
  writeProjectJson('assets/ref/image-qa/capture-report.json', report);
  console.log(JSON.stringify(report,null,2));
  if(report.errors.length||report.imageFailures.length)process.exitCode=1;
} finally { await browser.close(); }
