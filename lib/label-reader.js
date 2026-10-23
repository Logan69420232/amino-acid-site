/* Retry weak OCR with alternate table segmentation; never merge numbers from
   different passes, which could mix nutrition columns or duplicate ingredients. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./food-scan'),require('./supplement-scan'));else root.LabelReader=factory(root.FoodScan,root.SupplementScan);})(typeof globalThis!=='undefined'?globalThis:this,function(FoodScan,SupplementScan){
  function assess(text){
    if(SupplementScan.detect(text)){
      const d=SupplementScan.parse(text),rows=d.ingredients;
      const complete=rows.filter(r=>r.unit).length;
      return {score:rows.length*2+complete+(d.servingCount?1:0),readable:rows.length>0&&(complete>0||rows.length>=3)};
    }
    const values=FoodScan.parseLabel(text).values,keys=Object.keys(values);
    const main=keys.filter(k=>['energy','protein','fat','carb'].includes(k)).length;
    const plausible=keys.every(k=>values[k]>=0&&values[k]<=(k==='energy'?1000:100))&&(!['protein','fat','carb'].every(k=>k in values)||values.protein+values.fat+values.carb<=105);
    return {score:plausible?keys.length+main*2:0,readable:main===4&&plausible};
  }
  async function read(worker,image,{active=()=>true,retrying=()=>{}}={}){
    let best={text:'',score:-1,readable:false};
    for(const [i,settings] of [{thresholding_method:'2',tessedit_pageseg_mode:'3'},{thresholding_method:'0',tessedit_pageseg_mode:'6'},{thresholding_method:'2',tessedit_pageseg_mode:'6'}].entries()){
      if(!active())return null;if(i)retrying();
      await worker.setParameters(settings);if(!active())return null;
      const result=await worker.recognize(image);if(!active())return null;
      const text=String(result.data?.text||''),quality=assess(text);
      if(quality.score>best.score)best={text,...quality};
      if(best.readable)break;
    }
    return best;
  }
  return {read,assess};
});
