// imagegen 원본을 문서의 런타임 규격으로 변환한다. 그림 생성/리터칭은 하지 않는다.
// node scripts/prepare-image-assets.mjs jobs.json --sharp-module <sharp package directory>
// sharp는 로컬 작업용 도구이며 게임 런타임 의존성이 아니다.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { optionalPackage, projectPath, readProjectJson } from './lib/workspace.mjs';
import path from 'node:path';

const sharp = optionalPackage('sharp', '--sharp-module');
const input = process.argv[2];
const jobs = readProjectJson(input && !input.startsWith('--') ? input : 'assets/ref/image-production-jobs.json');
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
  if(kind==='atlas')copyFileSync(source,output);
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
      await input().extract(box).resize(Math.max(1,width-2),Math.max(1,height-2),{fit:'fill',kernel:'lanczos3'})
        .extend({top:1,bottom:1,left:1,right:1,background:'#00000000'}).png().toFile(output);
    }else{
      const parts=[];
      for(let i=0;i<11;i++){
        const left=Math.round((i%4)*info.width/4),top=Math.round(Math.floor(i/4)*info.height/3);
        const cw=Math.round((i%4+1)*info.width/4)-left,ch=Math.round((Math.floor(i/4)+1)*info.height/3)-top;
        const cell=await input().extract({left,top,width:cw,height:ch}).raw().toBuffer();
        const box=inkBounds(cell,cw,ch);parts.push({cell,cw,ch,box});
      }
      // 모든 포즈에 같은 배율을 쓰고 지상 포즈의 발 기준선을 맞춘다.
      const scale=Math.min(...parts.map(p=>Math.min(44/p.box.width,58/p.box.height)));
      const composite=[];
      for(let i=0;i<parts.length;i++){
        const {cell,cw,ch,box}=parts[i];
        const w=Math.max(1,Math.round(box.width*scale)),h=Math.max(1,Math.round(box.height*scale));
        const lift=i===1||i===6?9:i===7?3:0;
        const png=await sharp(cell,{raw:{width:cw,height:ch,channels:4}}).extract(box)
          .resize(w,h,{kernel:'lanczos3'}).png().toBuffer();
        composite.push({input:png,left:i*46+Math.floor((46-w)/2),top:Math.max(0,59-lift-h)});
      }
      await sharp({create:{width:506,height:60,channels:4,background:'#00000000'}}).composite(composite).png().toFile(output);
    }
  }else if(kind==='floors'&&job.bands){
    const meta=await sharp(source).metadata(),pieces=[];
    for(let i=0;i<job.bands.length-1;i++){
      const top=job.bands[i],h=job.bands[i+1]-top;
      const png=await sharp(source).extract({left:0,top,width:meta.width,height:h})
        .resize(width,68,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
      pieces.push({input:png,left:0,top:i*68});
    }
    await sharp({create:{width,height,channels:4,background:'#AEB0B2'}}).composite(pieces).removeAlpha().png().toFile(output);
  }else await sharp(source).resize(width,height,{fit:'fill',kernel:'lanczos3'}).removeAlpha().png().toFile(output);
  for(const variant of job.variants??[]){
    mkdirSync(path.dirname(projectPath(variant.output)),{recursive:true});
    await sharp(source).resize(variant.width,variant.height,{kernel:'lanczos3'})
      .removeAlpha().png().toFile(projectPath(variant.output));
  }
  const meta=await sharp(output).metadata();
  console.log(`${id}: ${meta.width}x${meta.height} -> ${output}`);
}
