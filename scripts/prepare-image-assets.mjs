// imagegen 원본을 문서의 런타임 규격으로 변환한다. 그림 생성/리터칭은 하지 않는다.
// node scripts/prepare-image-assets.mjs jobs.json --sharp-module <sharp package directory>
// sharp는 로컬 작업용 도구이며 게임 런타임 의존성이 아니다.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { cliOption, optionalPackage, projectPath, readProjectJson } from './lib/workspace.mjs';
import path from 'node:path';

const sharp = optionalPackage('sharp', '--sharp-module');
const input = process.argv[2];
const only = cliOption('--only', '').split(',').filter(Boolean); // 예: --only player,ent-rock
const jobs = readProjectJson(input && !input.startsWith('--') ? input : 'assets/ref/image-production-jobs.json')
  .filter(job => only.length === 0 || only.includes(job.id));
// 캐릭터·엔티티·층 시트는 논리 크기(매니페스트 w/h)의 2배 픽셀로 내보낸다 — DPR 2 폰에서 1:1로 찍힌다.
// drawAsset은 소스 크기를 보고 칸을 나누므로 매니페스트 논리 크기는 그대로다. 배경·상점 그림은 1배.
const OUT_SCALE = 2;
// 플레이어 시트 규격(논리 px): 칸 72x76, 대기 포즈 키 55.
const PLAYER_CELL = { w: 72, h: 76, idleH: 55 };
// 원본 4x3 격자에서 칼끝·발끝이 옆 칸 경계를 넘는 포즈의 가로 구간(원본 px). 격자대로 자르면 조각이 옆 포즈에 붙는다.
const PLAYER_SRC_X = { 2: [627, 925], 3: [925, 1254], 4: [0, 340], 5: [340, 627] };
const PLAYER_LIFT = [0, 13, 0, 0, 0, 0, 13, 4, 0, 0, 0]; // 점프·가드브레이크·공중가드는 발이 뜬다(논리 px)
// 집행기 아틀라스는 그려지는 크기(본체 250x44)의 2배 근처만 남긴다. executor.ts가 원본 1536 좌표에 이 비율을 곱해 읽는다.
const ATLAS_SCALE = 0.35;
const inkBounds = (data, w, h) => {
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>80){
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
  }
  if(x1<0)throw new Error('Empty sprite');
  return {left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};
};
for(const job of jobs){
  const {id,width,height,kind}=job;
  const source=projectPath(job.source),output=projectPath(job.output);
  mkdirSync(path.dirname(output),{recursive:true});
  const archived=projectPath(`assets/ref/generated/${id}.png`);
  mkdirSync(path.dirname(archived),{recursive:true});
  if(path.resolve(source)!==path.resolve(archived))copyFileSync(source,archived);
  if(existsSync(output)&&!job.output.replaceAll('\\','/').includes('/char/')){
    const backup=projectPath(path.join('assets/ref/pre-image-production',path.basename(path.dirname(output)),path.basename(output)));
    mkdirSync(path.dirname(backup),{recursive:true});
    if(!existsSync(backup))copyFileSync(output,backup);
  }
  if(kind==='atlas')await sharp(source).resize(Math.round(width*ATLAS_SCALE),Math.round(height*ATLAS_SCALE),{kernel:'lanczos3'}).png({compressionLevel:9}).toFile(output);
  else if(kind==='sprite'||kind==='player'){
    const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // 문서에 지정한 아이보리 매트를 투명화하고 원본 알파는 보존한다.
    for(let p=0;p<data.length;p+=4){
      const d=Math.abs(data[p]-244)+Math.abs(data[p+1]-241)+Math.abs(data[p+2]-232);
      if(d<48)data[p+3]=0;
    }
    const input=()=>sharp(data,{raw:{width:info.width,height:info.height,channels:4}});
    if(kind==='sprite'){
      const box=inkBounds(data,info.width,info.height);
      const S=OUT_SCALE;
      await input().extract(box).resize(Math.max(1,(width-2)*S),Math.max(1,(height-2)*S),{fit:'fill',kernel:'lanczos3'})
        .extend({top:S,bottom:S,left:S,right:S,background:'#00000000'}).png().toFile(output);
    }else{
      const parts=[];
      for(let i=0;i<11;i++){
        const [x0,x1]=PLAYER_SRC_X[i]??[Math.round((i%4)*info.width/4),Math.round((i%4+1)*info.width/4)];
        const left=x0,top=Math.round(Math.floor(i/4)*info.height/3);
        const cw=x1-x0,ch=Math.round((Math.floor(i/4)+1)*info.height/3)-top;
        const cell=await input().extract({left,top,width:cw,height:ch}).raw().toBuffer();
        const box=inkBounds(cell,cw,ch);parts.push({cell,cw,ch,box});
      }
      // 모든 포즈에 같은 배율(대기 포즈 키 = idleH)을 쓰고 지상 포즈의 발 기준선을 맞춘다.
      // 넓은 포즈가 배율을 끌어내리지 않도록 칸을 넓혔다. 칸을 넘는 포즈가 생기면 여기서 실패한다.
      const S=OUT_SCALE,cellW=PLAYER_CELL.w*S,cellH=PLAYER_CELL.h*S;
      const scale=PLAYER_CELL.idleH*S/parts[0].box.height;
      const composite=[];
      for(let i=0;i<parts.length;i++){
        const {cell,cw,ch,box}=parts[i];
        const w=Math.max(1,Math.round(box.width*scale)),h=Math.max(1,Math.round(box.height*scale));
        if(w>cellW||h>cellH)throw new Error(`pose ${i} ${w}x${h} exceeds ${cellW}x${cellH} cell`);
        const png=await sharp(cell,{raw:{width:cw,height:ch,channels:4}}).extract(box)
          .resize(w,h,{kernel:'lanczos3'}).png().toBuffer();
        composite.push({input:png,left:i*cellW+Math.floor((cellW-w)/2),top:Math.max(0,cellH-S-PLAYER_LIFT[i]*S-h)});
      }
      await sharp({create:{width:cellW*parts.length,height:cellH,channels:4,background:'#00000000'}}).composite(composite).png().toFile(output);
    }
  }else if(kind==='floors'&&job.bands){
    const meta=await sharp(source).metadata(),pieces=[];
    for(let i=0;i<job.bands.length-1;i++){
      const top=job.bands[i],h=job.bands[i+1]-top;
      const png=await sharp(source).extract({left:0,top,width:meta.width,height:h})
        .resize(width*OUT_SCALE,68*OUT_SCALE,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
      pieces.push({input:png,left:0,top:i*68*OUT_SCALE});
    }
    await sharp({create:{width:width*OUT_SCALE,height:height*OUT_SCALE,channels:4,background:'#AEB0B2'}}).composite(pieces).removeAlpha().png().toFile(output);
  }else await sharp(source).resize(width,height,{fit:'fill',kernel:'lanczos3'}).removeAlpha().png().toFile(output);
  for(const variant of job.variants??[]){
    mkdirSync(path.dirname(projectPath(variant.output)),{recursive:true});
    await sharp(source).resize(variant.width,variant.height,{kernel:'lanczos3'})
      .removeAlpha().png().toFile(projectPath(variant.output));
  }
  const meta=await sharp(output).metadata();
  console.log(`${id}: ${meta.width}x${meta.height} -> ${output}`);
}
