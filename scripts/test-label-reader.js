const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../lib/label-reader');
const good='Nutrition per 100 g\nEnergy 2450kJ / 590kcal\nFat 49 g\nSaturates 5.5 g\nCarbohydrate 11 g\nSugars 2.5 g\nFibre 6 g\nProtein 23 g\nSalt 0.01 g';
test('weak food photo retries and keeps a coherent nutrition table from the strongest pass',async()=>{
 let passes=0;const texts=['SUNFLOWER SEEDS\nNutrition information\nFat 4g',good,good];const worker={setParameters:async()=>{},recognize:async()=>({data:{text:texts[passes++]}})};
 const result=await R.read(worker,{});assert.equal(passes,3);assert.equal(result.text,good);assert.equal(result.readable,true);
});
test('good food and one-ingredient supplement labels require two agreeing recognition passes',async()=>{
 for(const text of [good,'Supplement facts\nServing Size: 1 scoop\nCreatine 3 g']){let passes=0;const result=await R.read({setParameters:async()=>{},recognize:async()=>{passes++;return {data:{text}};}},{});assert.equal(result.readable,true);assert.equal(passes,2);}
});
test('unreadable labels return an honest weak result and stop after bounded attempts',async()=>{
 let calls=0;const r=await R.read({setParameters:async()=>{},recognize:async()=>{calls++;return {data:{text:'PACKAGE ~~ 17%'}};}},{});assert.equal(calls,3);assert.equal(r.readable,false);assert.equal(r.text,'PACKAGE ~~ 17%');
});
test('closing scanner prevents recognition retries and stale results',async()=>{
 let active=true,calls=0;const r=await R.read({setParameters:async()=>{},recognize:async()=>{calls++;active=false;return {data:{text:good}};}},{},{active:()=>active});assert.equal(r,null);assert.equal(calls,1);
});

test('incomplete macros and implausible OCR digits stay flagged for review',()=>{
 assert.equal(R.assess('Energy 660 kcal\nFat 60 g\nProtein 21 g').readable,false);
 assert.equal(R.assess('Energy 660 kcal\nFat 60 g\nCarbohydrate 45 g\nProtein 21 g').readable,false);
});

const oil='Serving Size: 3 Softgels\nFish Oil 3600mg **\nOmega-3 2160mg **\nEicosapentaenoic acid (EPA) 1300mg **\nDocosahexaenoic acid (DHA) 860mg **';
test('supplements with missing units or serving size retry instead of reporting success',()=>{
 assert.equal(R.assess(oil).readable,true);
 assert.equal(R.assess(oil.replaceAll('mg','')).readable,false);
 assert.equal(R.assess(oil.replace('Serving Size: 3 Softgels','Supplement facts')).readable,false);
 assert.equal(R.assess(oil.replace('2160mg','216mg')).readable,false);
});
test('faint label retry uses enhanced pixels and prefers a complete coherent read',async()=>{
 const original={},enhanced={},seen=[];let enhancedCount=0;
 const worker={setParameters:async()=>{},recognize:async image=>{seen.push(image);return {data:{text:image===enhanced?oil:oil.replaceAll('mg','')}};}};
 const result=await R.read(worker,original,{enhance:image=>{assert.equal(image,original);enhancedCount++;return enhanced;}});
 assert.equal(result.text,oil);assert.equal(result.readable,false);assert.match(result.issues.join(' '),/second reading/);assert.deepEqual(seen,[original,enhanced,original]);assert.equal(enhancedCount,1);
});
test('adaptive contrast retains faint marks on uneven backgrounds without altering dimensions',()=>{
 const width=40,height=20,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const mark=(x===10||x===30)&&y>=5&&y<=15,grey=180+x- (mark?25:0),i=(y*width+x)*4;
  pixels.set([grey,grey,grey,255],i);
 }
 const result=R.contrastPixels(pixels,width,height);
 assert.equal(result.length,width*height*4);
 for(const x of [10,30])assert.equal(result[(10*width+x)*4],0);
 for(const x of [3,20,37])assert.equal(result[(10*width+x)*4],255);
});
test('explicit scaling preserves contrast, opacity and uniform image edges',()=>{
 const pixels=new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,255,255,255,255,255]);
 const scaled=R.resizePixels(pixels,2,2,3,3);
 assert.equal(scaled.length,36);
 for(let y=0;y<3;y++){
  assert.equal(scaled[y*12],0);assert.ok(Math.abs(scaled[y*12+4]-128)<=1);assert.equal(scaled[y*12+8],255);
 }
 for(let i=3;i<scaled.length;i+=4)assert.equal(scaled[i],255);
 const uniform=new Uint8ClampedArray(16).fill(180);for(let i=3;i<16;i+=4)uniform[i]=255;
 assert.equal(R.resizePixels(uniform,2,2,5,5)[0],180);
});

test('disagreeing readable digits are flagged instead of silently choosing the first',async()=>{
 const texts=[253,258,259].map(n=>'Serving Size: 3 Capsules\nElemental Magnesium '+n+' mg');let calls=0;
 const r=await R.read({setParameters:async()=>{},recognize:async()=>({data:{text:texts[calls++]}})},{});
 assert.equal(calls,3);assert.equal(r.readable,false);assert.match(r.issues.join(' '),/253 mg.*258 mg.*259 mg/);
});
test('two agreeing passes can replace a plausible but incorrect first reading',async()=>{
 const texts=[258,253,253].map(n=>'Serving Size: 3 Capsules\nElemental Magnesium '+n+' mg');let calls=0;
 const r=await R.read({setParameters:async()=>{},recognize:async()=>({data:{text:texts[calls++]}})},{});
 assert.equal(r.readable,true);assert.match(r.text,/253 mg/);assert.deepEqual(r.issues,[]);
});
function line(text,x0,y0,x1,y1){return {text,bbox:{x0,y0,x1,y1},words:[{text,bbox:{x0,y0,x1,y1}}]};}
const blocks=lines=>({blocks:[{paragraphs:[{lines}]}]});
test('amount fragments join only the same row, not the next ingredient',()=>{
 const data=blocks([line('Serving Size: 3 Capsules',0,0,250,20),line('Elemental Magnesium',0,50,200,70),line('Zinc',0,90,100,110),line('253 mg 67%',230,51,330,71),line('10 mg',230,91,300,111)]);
 const text=R.layoutText(data),d=require('../lib/supplement-scan').parse(text);
 assert.equal(d.ingredients[0].amount,253);assert.equal(d.ingredients[0].key,'magnesium');assert.equal(d.ingredients[1].amount,10);assert.equal(d.ingredients[1].key,'zinc');
});
test('table crop includes serving and rows but excludes footer and distant text',()=>{
 const data=blocks([line('Nutritional Information',300,300,700,340),line('Serving Size: 3 Capsules',300,350,600,375),line('Magnesium Bisglycinate 1950mg',300,420,720,450),line('Elemental Magnesium 253mg 67%',300,470,730,500),line('Reference Intake of an average adult',300,520,730,545)]);
 const r=R.tableRegion(data,1200,1600);assert.ok(r.left<=300&&r.left+r.width>=730);assert.ok(r.top<=300&&r.top+r.height>=500);assert.ok(r.top+r.height<520);assert.equal(R.tableRegion({},1200,1600),null);
});
