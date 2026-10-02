const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const out=path.resolve('private/validation/rolodex-corners');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height] of [[390,844],[360,640],[1280,900]]){
    const context=await browser.newContext({viewport:{width,height}}),p=await context.newPage();
    await p.goto(process.env.URBANOMICS_LAB_URL||'http://127.0.0.1:4176/lab/');
    const done=p.getByRole('button',{name:'Done',exact:true});await done.waitFor();
    const box=await p.locator('[data-card-index="4"]').boundingBox();
    const radius=await p.locator('[data-card-index="4"]').evaluate(el=>getComputedStyle(el).borderTopLeftRadius);
    const before=await p.screenshot({path:path.join(out,`before-${width}.png`)});
    // Freeze the actual replacement at its first frame to catch a single-frame flash.
    await p.evaluate(()=>{
      const animate=Element.prototype.animate;window.cornerAnimations=[];
      Element.prototype.animate=function(...args){const a=animate.apply(this,args);a.pause();a.currentTime=0;window.cornerAnimations.push(a);return a;};
    });
    await done.click();await p.locator('.send-envelope').waitFor();
    const radii=await p.locator('.paper-face,.flap-back').evaluateAll(els=>els.map(el=>getComputedStyle(el).borderTopLeftRadius));
    assert.ok(radii.every(r=>r===radius),'front and back share the source radius');
    const after=await p.screenshot({path:path.join(out,`start-${width}.png`)});
    const delta=await p.evaluate(async({images,box})=>{
      const pixels=await Promise.all(images.map(async image=>{
        const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(image),c=>c.charCodeAt(0))],{type:'image/png'}));
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return {data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width};
      }));
      let maximum=0;
      for(const right of [false,true])for(const bottom of [false,true])for(let dx=1;dx<=3;dx++)for(let dy=1;dy<=3;dy++){
        const x=Math.round(right?box.x+box.width-1-dx:box.x+dx),y=Math.round(bottom?box.y+box.height-1-dy:box.y+dy);
        const index=(y*pixels[0].width+x)*4;
        for(let c=0;c<3;c++)maximum=Math.max(maximum,Math.abs(pixels[0].data[index+c]-pixels[1].data[index+c]));
      }
      return maximum;
    },{images:[before.toString('base64'),after.toString('base64')],box});
    assert.ok(delta<=3,`${width}: square backing must not flash in any rounded corner (RGB change ${delta})`);
    await p.evaluate(()=>window.cornerAnimations.forEach(a=>a.currentTime=230));
    await p.screenshot({path:path.join(out,`fold-${width}.png`)});
    await context.close();
  }
  await browser.close();console.log('Passed: all four corner cutouts preserved at the first fold frame, matching front/back radii on phone and desktop.');
})().catch(e=>{console.error(e);process.exit(1);});
