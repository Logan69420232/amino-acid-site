const fs=require('node:fs'),path=require('node:path');
module.exports=function(root){
 const dest=path.join(root,'dist/assets/scanner');fs.mkdirSync(dest,{recursive:true});
 const copy=(src,name)=>fs.copyFileSync(path.join(root,'node_modules',src),path.join(dest,name));
 copy('@zxing/browser/umd/zxing-browser.min.js','zxing.min.js');
 copy('@zxing/browser/LICENSE','zxing.LICENSE');
 copy('tesseract.js/dist/tesseract.min.js','tesseract.min.js');
 copy('tesseract.js/dist/worker.min.js','worker.min.js');
 copy('tesseract.js/LICENSE.md','tesseract.LICENSE');
 copy('tesseract.js/dist/tesseract.min.js.LICENSE.txt','tesseract.min.js.LICENSE.txt');
 copy('tesseract.js/dist/worker.min.js.LICENSE.txt','worker.min.js.LICENSE.txt');
 for(const f of fs.readdirSync(path.join(root,'node_modules/tesseract.js-core')))if(/\.wasm(?:\.js)?$/.test(f)||f==='LICENSE')copy('tesseract.js-core/'+f,f==='LICENSE'?'core.LICENSE':f);
 copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz','eng.traineddata.gz');
};
