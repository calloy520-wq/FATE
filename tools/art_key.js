// 綠幕去背 → 裁切 → 縮放 → WebP（用 Chromium 的 canvas，環境沒有 PIL/sharp）
const fs=require('fs'), path=require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT=path.join(__dirname,'..'), RAW=path.join(ROOT,'art/raw'), OUT=path.join(ROOT,'art');
// 用法：node tools/art_key.js [id:最大高度 ...]（不給就跑全部角色）；bg_ 開頭的是背景：不去背，數字當最大寬度（建議 bg_hill:1280）；輸出 art/<id>.webp 和預覽 art/raw/_preview.png（不進 repo）
const DEF=[['shuang',1100],['qingli',1100],['xiaoman',1000],['chilian',1100],['aduo',1100],['abai',700]];
const JOBS=process.argv.length>2?process.argv.slice(2).map(a=>{const [id,h]=a.split(':');return [id,+(h||1100)];}):DEF;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage();
  await p.setContent('<html><body></body></html>');
  for(const [id,maxH] of JOBS){
    const src='data:image/png;base64,'+fs.readFileSync(path.join(RAW,id+'.png')).toString('base64');
    const res=await p.evaluate(async ({src,maxH,bg})=>{
      const img=new Image(); img.src=src; await img.decode();
      if(bg){ // 背景圖：不去背，只縮到寬 maxH（給 1280）再轉 WebP
        const s=Math.min(1,maxH/img.width), o=document.createElement('canvas'); o.width=Math.round(img.width*s); o.height=Math.round(img.height*s);
        const ox=o.getContext('2d'); ox.imageSmoothingQuality='high'; ox.drawImage(img,0,0,o.width,o.height);
        return {key:['-'], size:[o.width,o.height], url:o.toDataURL('image/webp',0.82)};
      }
      const W=img.width,H=img.height, c=document.createElement('canvas'); c.width=W;c.height=H;
      const x=c.getContext('2d'); x.drawImage(img,0,0); const d=x.getImageData(0,0,W,H), a=d.data;
      // 背景色：取四邊像素的中位數
      const rs=[],gs=[],bs=[]; const push=i=>{rs.push(a[i]);gs.push(a[i+1]);bs.push(a[i+2]);};
      for(let i=0;i<W;i+=4){push((i)*4);push(((H-1)*W+i)*4);} for(let j=0;j<H;j+=4){push((j*W)*4);push((j*W+W-1)*4);}
      const med=v=>v.sort((p,q)=>p-q)[v.length>>1]; const kr=med(rs),kg=med(gs),kb=med(bs);
      const dk=kg-Math.max(kr,kb), lo=dk*0.06, hi=dk*0.55;   // 透明度＝混進多少綠幕（薄紗、墨霧才會正確變半透明）
      let minX=W,minY=H,maxX=0,maxY=0;
      for(let y=0;y<H;y++)for(let X=0;X<W;X++){const i=(y*W+X)*4,r=a[i],g=a[i+1],bl=a[i+2];
        const dd=g-Math.max(r,bl); let al=dd<=lo?1:dd>=hi?0:1-(dd-lo)/(hi-lo);
        if(al<0.06) al=0;
        if(al>0&&al<1){ // 還原被綠幕混到的顏色，再去溢色
          let R=(r-(1-al)*kr)/al,Gg=(g-(1-al)*kg)/al,B=(bl-(1-al)*kb)/al;
          R=Math.max(0,Math.min(255,R));Gg=Math.max(0,Math.min(255,Gg));B=Math.max(0,Math.min(255,B));
          a[i]=R;a[i+1]=Math.min(Gg,Math.max(R,B));a[i+2]=B;
        } else if(al===1 && dd>0){ a[i+1]=Math.max(r,bl)+Math.round(Math.min(dd,lo)*0.5); }
        a[i+3]=Math.round(al*255);
        if(al>0.1){ if(X<minX)minX=X; if(X>maxX)maxX=X; if(y<minY)minY=y; if(y>maxY)maxY=y; }
      }
      x.putImageData(d,0,0);
      const pad=6; minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(W-1,maxX+pad);maxY=Math.min(H-1,maxY+pad);
      const cw=maxX-minX+1,ch=maxY-minY+1, s=Math.min(1,maxH/Math.max(ch, maxH<=800?cw:0));
      const o=document.createElement('canvas'); o.width=Math.round(cw*s); o.height=Math.round(ch*s);
      const ox=o.getContext('2d'); ox.imageSmoothingQuality='high'; ox.drawImage(c,minX,minY,cw,ch,0,0,o.width,o.height);
      return {key:[kr,kg,kb], size:[o.width,o.height], url:o.toDataURL('image/webp',0.9)};
    },{src,maxH,bg:id.indexOf('bg_')===0});
    const buf=Buffer.from(res.url.split(',')[1],'base64'); fs.writeFileSync(path.join(OUT,id+'.webp'),buf);
    console.log(id,'key',res.key.join(','),'size',res.size.join('x'),(buf.length/1024).toFixed(0)+'KB');
  }
  // 預覽：每張貼在深色和亮色背景上
  const imgs=JOBS.map(([id])=>'data:image/webp;base64,'+fs.readFileSync(path.join(OUT,id+'.webp')).toString('base64'));
  await p.setViewportSize({width:1500,height:900});
  await p.setContent('<body style="margin:0;display:flex;flex-wrap:wrap">'+imgs.map(u=>'<div style="width:250px;height:440px;background:linear-gradient(#2b1d3d,#d9824f);display:flex;align-items:flex-end;justify-content:center"><img src="'+u+'" style="max-width:100%;max-height:100%"></div>').join('')+imgs.map(u=>'<div style="width:250px;height:440px;background:#fff;display:flex;align-items:flex-end;justify-content:center"><img src="'+u+'" style="max-width:100%;max-height:100%"></div>').join('')+'</body>');
  await p.waitForTimeout(300); await p.screenshot({path:path.join(RAW,'_preview.png'),fullPage:true});
  await b.close();
})();
