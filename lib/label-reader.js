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
  async function read(worker,image,{active=()=>true,retrying=()=>{},enhance=prepareImage}={}){
    let best={text:'',score:-1,readable:false};
    const passes=[{thresholding_method:'2',tessedit_pageseg_mode:'3'},{thresholding_method:'0',tessedit_pageseg_mode:'3'},{thresholding_method:'2',tessedit_pageseg_mode:'6'}];
    for(const [i,settings] of passes.entries()){
      if(!active())return null;if(i)retrying();
      const input=i===1?(enhance(image)||image):image;
      await worker.setParameters(settings);if(!active())return null;
      const result=await worker.recognize(input);if(!active())return null;
      const text=String(result.data?.text||''),quality=assess(text);
      if((quality.readable&&!best.readable)||(quality.readable===best.readable&&quality.score>best.score))best={text,...quality};
      if(best.readable)break;
    }
    return best;
  }
  return {read,assess,contrastPixels,resizePixels};
});
