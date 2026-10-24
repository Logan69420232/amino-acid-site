/* Retry weak OCR with alternate table segmentation; never merge numbers from
   different passes, which could mix nutrition columns or duplicate ingredients. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./food-scan'),require('./supplement-scan'));else root.LabelReader=factory(root.FoodScan,root.SupplementScan);})(typeof globalThis!=='undefined'?globalThis:this,function(FoodScan,SupplementScan){
  function assess(text){
    if(SupplementScan.detect(text)){
      const d=SupplementScan.parse(text),rows=d.ingredients;
      const complete=rows.filter(r=>r.unit).length;
      let valid=false;
      if(rows.length&&complete===rows.length&&d.servingCount){try{SupplementScan.makeFood(d,'scan-quality');valid=true;}catch{}}
      return {score:complete*4+rows.length+(d.servingCount?2:0),readable:valid};
    }
    const values=FoodScan.parseLabel(text).values,keys=Object.keys(values);
    const main=keys.filter(k=>['energy','protein','fat','carb'].includes(k)).length;
    const plausible=keys.every(k=>values[k]>=0&&values[k]<=(k==='energy'?1000:100))&&(!['protein','fat','carb'].every(k=>k in values)||values.protein+values.fat+values.carb<=105);
    return {score:plausible?keys.length+main*2:0,readable:main===4&&plausible};
  }
  // Adaptive contrast separates faint grey text from uneven lighting. Three
  // separable box blurs approximate a Gaussian without canvas-filter support.
  // This changes pixels only: no label words, numbers or units are inferred.
  function contrastPixels(rgba,width,height){
    const n=width*height;let a=new Float32Array(n),b=new Float32Array(n);
    for(let i=0;i<n;i++)a[i]=rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114;
    const sigma=Math.max(4,Math.max(width,height)/512),ideal=Math.sqrt(4*sigma*sigma+1);
    let lower=Math.floor(ideal);if(lower%2===0)lower--;
    const upper=lower+2,m=Math.round((12*sigma*sigma-3*lower*lower-12*lower-9)/(-4*lower-4));
    function blur(horizontal,r){
      const length=horizontal?width:height,lines=horizontal?height:width,step=horizontal?1:width;
      for(let line=0;line<lines;line++){
        const base=horizontal?line*width:line;let sum=0;
        for(let k=-r;k<=r;k++)sum+=a[base+Math.max(0,Math.min(length-1,k))*step];
        for(let x=0;x<length;x++){
          b[base+x*step]=sum/(2*r+1);
          sum+=a[base+Math.min(length-1,x+r+1)*step]-a[base+Math.max(0,x-r)*step];
        }
      }
      [a,b]=[b,a];
    }
    for(let pass=0;pass<3;pass++){const r=((pass<m?lower:upper)-1)/2;blur(true,r);blur(false,r);}
    for(let i=0;i<n;i++){
      const grey=rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114,v=grey<a[i]-7?0:255;
      rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=v;rgba[i*4+3]=255;
    }
    return rgba;
  }
  function prepareImage(image){
    if(typeof document==='undefined'||!image?.getContext)return null;
    const out=document.createElement('canvas');out.width=image.width;out.height=image.height;
    const ctx=out.getContext('2d'),pixels=image.getContext('2d').getImageData(0,0,image.width,image.height);
    contrastPixels(pixels.data,image.width,image.height);ctx.putImageData(pixels,0,0);
    const scale=Math.min(1.5,3200/Math.max(image.width,image.height));
    if(scale<=1)return out;
    const larger=document.createElement('canvas');larger.width=Math.round(image.width*scale);larger.height=Math.round(image.height*scale);
    const zoom=larger.getContext('2d'),scaled=zoom.createImageData(larger.width,larger.height);
    scaled.data.set(resizePixels(pixels.data,image.width,image.height,larger.width,larger.height));zoom.putImageData(scaled,0,0);return larger;
  }
  // Explicit bicubic scaling keeps small digit strokes consistent across
  // browsers; canvas imageSmoothingQuality is only a platform-dependent hint.
  function resizePixels(rgba,width,height,outWidth,outHeight){
    const horizontal=new Uint8ClampedArray(outWidth*height),result=new Uint8ClampedArray(outWidth*outHeight*4);
    function taps(length,outLength){return Array.from({length:outLength},(_,x)=>{
      const pos=(x+.5)*length/outLength-.5,base=Math.floor(pos),t=pos-base;
      const weights=[-.5*t+t*t-.5*t*t*t,1-2.5*t*t+1.5*t*t*t,.5*t+2*t*t-1.5*t*t*t,-.5*t*t+.5*t*t*t];
      // Truncate and renormalize at edges, like the reference bicubic filter.
      let sum=0;const valid=weights.map((w,i)=>{if(base+i-1<0||base+i-1>=length)return 0;sum+=w;return w;});
      return valid.map((w,i)=>[Math.max(0,Math.min(length-1,base+i-1)),w/sum]);
    });}
    const xs=taps(width,outWidth),ys=taps(height,outHeight);
    for(let y=0;y<height;y++)for(let x=0;x<outWidth;x++){let v=0;for(const [i,w] of xs[x])v+=rgba[(y*width+i)*4]*w;horizontal[y*outWidth+x]=Math.round(v);}
    for(let y=0;y<outHeight;y++)for(let x=0;x<outWidth;x++){let v=0;for(const [i,w] of ys[y])v+=horizontal[i*outWidth+x]*w;const p=(y*outWidth+x)*4;result[p]=result[p+1]=result[p+2]=Math.round(v);result[p+3]=255;}
    return result;
  }
  function linesFrom(data){
    return (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
  }
  // Locate an English nutrition panel using OCR positions. Bounds include the
  // serving declaration and amount column, but stop before packaging prose.
  // No product-specific coordinates or nutrition values are used.
  function tableRegion(data,width,height){
    const lines=linesFrom(data);
    const heading=lines.find(l=>/^\s*(?:nutritional?\s+(?:info|facts)|nutrition\b|supplement facts)/i.test(l.text||'')&&!/LLC/i.test(l.text));
    if(!heading?.bbox||!width||!height)return null;
    const words=(heading.words||[]).filter(w=>/[a-z0-9]/i.test(w.text));
    if(!words.length)return null;
    // Stop at a large gap so an adjacent language panel isn't included.
    const selected=[words[0]];
    for(const word of words.slice(1)){const last=selected.at(-1);if(word.bbox.x0-last.bbox.x1>Math.max(80,(last.bbox.y1-last.bbox.y0)*8))break;selected.push(word);}
    const left=Math.min(...selected.map(w=>w.bbox.x0)),right=Math.max(...selected.map(w=>w.bbox.x1));
    const span=right-left,h=heading.bbox.y1-heading.bbox.y0;
    if(span<80)return null;
    const x0=Math.max(0,left-span*.08),x1=Math.min(width,right+span*.25),y0=Math.max(0,heading.bbox.y0-h*.35);
    const relevant=lines.map(l=>({...l,words:(l.words||[]).filter(w=>w.bbox.x0>=x0&&w.bbox.x1<=x1)})).filter(l=>l.words.length).map(l=>({...l,text:l.words.map(w=>w.text).join(' '),top:Math.min(...l.words.map(w=>w.bbox.y0)),bottom:Math.max(...l.words.map(w=>w.bbox.y1))})).filter(l=>l.top>heading.bbox.y1);
    const footer=relevant.filter(l=>/^(?:[^a-z]*)(?:nutrient reference|reference intake|ingredients|suggested use|directions|storage|allergy|manufactured|distributed)\b/i.test(l.text)).sort((a,b)=>a.top-b.top)[0];
    const rows=relevant.filter(l=>/\d/.test(l.text)&&!/^servings?\b/i.test(l.text)&&(footer?l.top<footer.top:true));
    if(rows.length<1)return null;
    const y1=Math.min(height,footer?footer.top-3:Math.max(...rows.map(l=>l.bottom))+h*.5);
    if(y1-y0<80||(x1-x0)*(y1-y0)>width*height*.9)return null;
    return {left:Math.floor(x0),top:Math.floor(y0),width:Math.ceil(x1-x0),height:Math.ceil(y1-y0)};
  }
  function cropImage(image,box){
    if(!box||typeof document==='undefined'||!image?.getContext)return image;
    const out=document.createElement('canvas');out.width=box.width;out.height=box.height;
    out.getContext('2d').drawImage(image,box.left,box.top,box.width,box.height,0,0,box.width,box.height);return out;
  }
  // Rejoin fragments on the same printed row when OCR puts the amount column
  // in a different block. Preserve OCR's own lines for curved bottle labels.
  function layoutText(data){
    const rows=linesFrom(data).filter(l=>l.bbox&&l.text?.trim()).map(l=>({text:l.text.trim(),box:{...l.bbox}})).sort((a,b)=>a.box.y0-b.box.y0);
    const merged=[];
    for(const row of rows){
      const h=row.box.y1-row.box.y0,cy=(row.box.y0+row.box.y1)/2;
      const matches=merged.filter(r=>Math.abs((r.box.y0+r.box.y1)/2-cy)<Math.min(h,r.box.y1-r.box.y0)*.45&&(r.box.x1<row.box.x0||row.box.x1<r.box.x0));
      if(matches.length===1){const r=matches[0];r.text=r.box.x0<row.box.x0?r.text+' '+row.text:row.text+' '+r.text;r.box={x0:Math.min(r.box.x0,row.box.x0),y0:Math.min(r.box.y0,row.box.y0),x1:Math.max(r.box.x1,row.box.x1),y1:Math.max(r.box.y1,row.box.y1)};}
      else merged.push(row);
    }
    return merged.map(r=>r.text).join('\n');
  }
  function fields(text){
    if(SupplementScan.detect(text)){
      const d=SupplementScan.parse(text),out={};
      if(d.servingCount)out['Serving size']={value:d.servingCount,unit:d.doseUnit};
      for(const r of d.ingredients)if(r.unit&&typeof r.amount==='number')out[r.key||r.label.toLowerCase()]={value:r.amount,unit:r.unit};
      return out;
    }
    return Object.fromEntries(Object.entries(FoodScan.parseLabel(text).values).map(([k,value])=>[k,{value,unit:''}]));
  }
  function differences(best,reads){
    const current=fields(best.text),issues=[];
    for(const [key,value] of Object.entries(current)){
      const observed=reads.map(r=>fields(r.text)[key]).filter(Boolean),same=observed.filter(v=>v.value===value.value&&v.unit===value.unit);
      if(same.length<2&&observed.some(v=>v.value!==value.value||v.unit!==value.unit))issues.push('Check '+key+': the readings disagree ('+[...new Set(observed.map(v=>v.value+' '+v.unit))].join(' / ')+').');
    }
    return issues;
  }
  async function read(worker,image,{active=()=>true,retrying=()=>{},enhance=prepareImage,crop=cropImage}={}){
    let best={text:'',score:-1,readable:false},region=null,panel=image;const reads=[];
    const passes=[{thresholding_method:'2',tessedit_pageseg_mode:'3'},{thresholding_method:'0',tessedit_pageseg_mode:'6'},{thresholding_method:'2',tessedit_pageseg_mode:'6'}];
    for(const [i,settings] of passes.entries()){
      if(!active())return null;if(i)retrying();
      const input=i===1?(enhance(panel)||panel):i===2?panel:image;
      await worker.setParameters(settings);if(!active())return null;
      const result=await worker.recognize(input,{},{text:true,blocks:true});if(!active())return null;
      const raw=String(result.data?.text||''),spatial=layoutText(result.data||{});
      // Pick one coherent interpretation from this pass, never combine amounts
      // across images. Prefer the original when spatial ordering adds nothing.
      const variants=[raw,spatial].filter(Boolean).map(text=>({text,...assess(text),confidence:Number(result.data?.confidence)||0}));
      variants.sort((a,b)=>Number(b.readable)-Number(a.readable)||b.score-a.score);
      const candidate=variants[0]||{text:'',score:0,readable:false};reads.push(candidate);
      const signatureOf=r=>JSON.stringify(Object.entries(fields(r.text)).sort(([a],[b])=>a.localeCompare(b)));
      const votes=r=>reads.filter(other=>signatureOf(other)===signatureOf(r)).length;
      best=[...reads].sort((a,b)=>Number(b.readable)-Number(a.readable)||votes(b)-votes(a)||b.score-a.score||b.confidence-a.confidence)[0];
      if(i===0){region=tableRegion(result.data||{},image.width,image.height);if(region)panel=crop(image,region)||image;}
      // A structurally valid first result is not proof that its digits are right.
      const signature=JSON.stringify(fields(best.text));
      if(best.readable&&reads.filter(r=>r.readable&&JSON.stringify(fields(r.text))===signature).length>=2)break;
    }
    const issues=differences(best,reads);
    const confirmed=Object.entries(fields(best.text)).every(([key,value])=>reads.filter(r=>{const v=fields(r.text)[key];return v&&v.value===value.value&&v.unit===value.unit;}).length>=2);
    if(best.readable&&!confirmed&&!issues.length)issues.push('A second reading could not confirm every amount. Compare the filled values with your photo.');
    if(SupplementScan.detect(best.text))issues.push(...SupplementScan.parse(best.text).issues);
    return {...best,readable:best.readable&&!issues.length,issues,region,passes:reads.length};
  }
  return {read,assess,contrastPixels,resizePixels,tableRegion,layoutText};
});
